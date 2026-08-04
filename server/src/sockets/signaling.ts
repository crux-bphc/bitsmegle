import { Server, Socket } from 'socket.io';
import { state } from '../services/realtime';
import type { Call } from '../services/realtime';
import { identify } from '../services/identity';
import type { Identity } from '../services/identity';
import { recordPairing } from '../services/pairings';

// Tracks the setInterval handles used to retry relaying an ICE candidate until the
// call is answered, so any exit path (answered, abandoned, disconnect) can clear
// them exactly once instead of letting unanswered ones run forever.
const pendingIceRelays = new Map<string, NodeJS.Timeout[]>();

function addPendingIceRelay(callId: string, timer: NodeJS.Timeout) {
	const timers = pendingIceRelays.get(callId);
	if (timers) {
		timers.push(timer);
	} else {
		pendingIceRelays.set(callId, [timer]);
	}
}

function removePendingIceRelay(callId: string, timer: NodeJS.Timeout) {
	const timers = pendingIceRelays.get(callId);
	if (!timers) return;
	const index = timers.indexOf(timer);
	if (index !== -1) timers.splice(index, 1);
	if (timers.length === 0) pendingIceRelays.delete(callId);
}

function clearPendingIceRelays(callId: string) {
	const timers = pendingIceRelays.get(callId);
	if (!timers) return;
	timers.forEach(clearInterval);
	pendingIceRelays.delete(callId);
}

export default function signaling(io: Server) {
	// Resolve the connecting socket's identity from its access token, server-side.
	// Anonymous sockets are still allowed — they keep the online counter working on
	// public pages — but they cannot take part in any call.
	io.use(async (socket: Socket, next) => {
		const token = socket.handshake.auth?.token;
		if (typeof token === 'string' && token.length > 0) {
			try {
				socket.data.user = await identify(token);
			} catch (err) {
				console.warn(`Socket ${socket.id} presented an invalid access token`);
			}
		}
		next();
	});

	io.on('connection', (socket: Socket) => {
		state.userCount += 1;
		state.stats.totalUsersConnected += 1;
		state.stats.maxActiveUserCount = Math.max(state.stats.maxActiveUserCount, state.userCount);
		io.sockets.emit('userCountChange', state.userCount);

		/** The verified identity of this socket, or null if it is anonymous. */
		const requireUser = (event: string): Identity | null => {
			const me = socket.data.user as Identity | undefined;
			if (!me) {
				console.warn(`Dropping ${event}: socket ${socket.id} is not authenticated`);
				socket.emit('auth-required', event);
				return null;
			}
			return me;
		};

		socket.on('disconnect', () => {
			state.userCount -= 1;

			// A disconnecting offerer, answerer, or pending (not-yet-accepted)
			// answerer can never receive a relayed candidate for its calls
			// again, so stop retrying them.
			state.calls
				.filter(
					(c: Call) =>
						c.offerMaker === socket || c.answerMaker === socket || c.pendingAnswerMaker === socket
				)
				.forEach((c: Call) => clearPendingIceRelays(c.callId));

			// remove stale unpaired calls
			state.calls = state.calls.filter(
				(c: Call) => !(c.paired === false && c.offerMaker === socket)
			);
			io.sockets.emit('userCountChange', state.userCount);
		});

		socket.on('looking-for-somebody', () => {
			const me = requireUser('looking-for-somebody');
			if (!me) return;

			console.log(`${me.name} is looking for somebody`);
			// find an unpaired offer from somebody who is not us
			const call = state.calls.find(
				(c: Call) =>
					c.answer === null && c.offerMaker !== socket && !c.paired && c.offerMakerUser.id !== me.id
			);

			if (call) {
				console.log(`${me.name} is paired with ${call.offerMakerUser.name}`);
				state.stats.totalCallsPaired += 1;
				call.paired = true;
				call.pendingAnswerMaker = socket;
				call.answerMakerUser = me;
				socket.emit('call-found', call.callId);
			} else {
				console.log(`Found no one to pair with ${me.name} at the moment`);
				socket.emit('call-not-found', null);
				state.stats.totalCallsMade += 1;
			}
		});

		socket.on('make-offer', (data: any) => {
			const me = requireUser('make-offer');
			if (!me) return;

			state.calls.push({
				callId: data.callId,
				offer: data.offer,
				offerMaker: socket,
				offerMakerUser: me,
				answer: null,
				answerMaker: null,
				pendingAnswerMaker: null,
				answerMakerUser: null,
				offerCandidates: [],
				answerCandidates: [],
				paired: false
			});
		});

		socket.on('offerCandidate', (candidate: any) => {
			const call = state.calls.find((c) => c.callId === candidate.callId);
			if (call) {
				call.offerCandidates.push(candidate);
				const interval = setInterval(() => {
					if (call.answerMaker) {
						call.answerMaker.emit('add-ice-candidate', candidate);
						clearInterval(interval);
						removePendingIceRelay(candidate.callId, interval);
					}
				}, 100);
				addPendingIceRelay(candidate.callId, interval);
			}
		});

		socket.on('make-answer', (data: any) => {
			const call = state.calls.find((c) => c.callId === data.callId);
			if (call) {
				call.answer = data.answer;
				call.offerMaker.emit('answer-made', data);
			}
		});

		socket.on('answerCandidate', (candidate: any) => {
			const call = state.calls.find((c) => c.callId === candidate.callId);
			if (call) {
				call.answerCandidates.push(candidate);
				call.offerMaker.emit('add-ice-candidate', candidate);
				// call.answerMaker?.emit('add-ice-candidate', data.offerCandidates);
			}
		});

		socket.on('call-accepted', (data: any) => {
			const me = requireUser('call-accepted');
			if (!me) return;

			const call = state.calls.find((c) => c.callId === data?.callId);
			if (!call) return;

			// Only the socket this call was actually matched with may accept it.
			// Without this, anyone who learns a callId could take over the answer
			// side and manufacture a pairing they were never part of.
			if (call.pendingAnswerMaker !== socket) {
				console.warn(`Dropping call-accepted from non-participant socket ${socket.id}`);
				return;
			}
			if (call.answerMaker) return; // already accepted

			console.log('Call Accepted');
			call.answerMaker = socket;

			// stamp the callId onto both sockets
			call.offerMaker.data.currentCallId = call.callId;
			socket.data.currentCallId = call.callId;

			// Both sides are now verified and connected to each other, which is what
			// entitles each of them to rate the other exactly once.
			recordPairing(call.callId, call.offerMakerUser.id, me.id);

			// send the offer to the answer side
			socket.emit('call-data', JSON.stringify({ callId: data.callId, offer: call.offer }));
		});

		socket.on('who-is-remote', (payload: any) => {
			const call = state.calls.find((c) => c.callId === payload?.callId);
			if (!call) return;

			if (call.offerMaker === socket) {
				socket.emit('remote-user', call.answerMakerUser);
			} else if (call.answerMaker === socket || call.pendingAnswerMaker === socket) {
				socket.emit('remote-user', call.offerMakerUser);
			} else {
				console.warn(`Dropping who-is-remote from non-participant socket ${socket.id}`);
			}
		});

		socket.on('chat-message', (msg: any) => {
			const callId = socket.data.currentCallId as string | undefined;
			if (!callId) {
				console.warn('Dropping chat-message: no active call for socket', socket.id);
				return;
			}

			const call = state.calls.find(
				(c) => c.callId === callId && c.paired && c.answerMaker !== null
			);
			if (!call) {
				console.warn('Dropping chat-message: call not found or not paired', callId);
				return;
			}

			const isOfferer = call.offerMaker === socket;
			const sender = isOfferer ? call.offerMakerUser : call.answerMakerUser!;
			const target = isOfferer ? call.answerMakerUser! : call.offerMakerUser;
			const targetSock = isOfferer ? call.answerMaker! : call.offerMaker;

			console.log(`Message from ${sender.name} to ${target.name}:`, msg);
			targetSock.emit('chat-message-recv', msg);
		});
	});
}
