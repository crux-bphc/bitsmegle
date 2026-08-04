import { Server, Socket } from 'socket.io';
import { state } from '../services/realtime';
import type { Call } from '../services/realtime';

const MAX_CHAT_MESSAGE_BYTES = 4 * 1024;
// SDP offers/answers and ICE candidates are normally well under this; the cap
// just keeps a malicious/buggy client from parking huge payloads in memory.
const MAX_SIGNALING_PAYLOAD_BYTES = 64 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function exceedsByteLimit(value: unknown, maxBytes: number): boolean {
	try {
		return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > maxBytes;
	} catch {
		return true;
	}
}

function isValidUser(value: unknown): value is Record<string, unknown> {
	return isPlainObject(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name);
}

function isValidSessionDescription(value: unknown): value is Record<string, unknown> {
	return isPlainObject(value) && isNonEmptyString(value.sdp) && isNonEmptyString(value.type);
}

function isValidOfferPayload(
	data: unknown
): data is { callId: string; offer: unknown; user: unknown } {
	return (
		isPlainObject(data) &&
		isNonEmptyString(data.callId) &&
		isValidSessionDescription(data.offer) &&
		isValidUser(data.user) &&
		!exceedsByteLimit(data, MAX_SIGNALING_PAYLOAD_BYTES)
	);
}

function isValidAnswerPayload(data: unknown): data is { callId: string; answer: unknown } {
	return (
		isPlainObject(data) &&
		isNonEmptyString(data.callId) &&
		isValidSessionDescription(data.answer) &&
		!exceedsByteLimit(data, MAX_SIGNALING_PAYLOAD_BYTES)
	);
}

function isValidCandidatePayload(data: unknown): data is { callId: string; candidate: unknown } {
	return (
		isPlainObject(data) &&
		isNonEmptyString(data.callId) &&
		isPlainObject(data.candidate) &&
		!exceedsByteLimit(data, MAX_SIGNALING_PAYLOAD_BYTES)
	);
}

function isValidCallIdPayload(data: unknown): data is { callId: string } {
	return isPlainObject(data) && isNonEmptyString(data.callId);
}

export default function signaling(io: Server) {
	io.on('connection', (socket: Socket) => {
		state.userCount += 1;
		state.stats.totalUsersConnected += 1;
		state.stats.maxActiveUserCount = Math.max(state.stats.maxActiveUserCount, state.userCount);
		io.sockets.emit('userCountChange', state.userCount);

		socket.on('disconnect', () => {
			state.userCount -= 1;
			// remove stale unpaired calls
			state.calls = state.calls.filter(
				(c: Call) => !(c.paired === false && c.offerMaker === socket)
			);
			io.sockets.emit('userCountChange', state.userCount);
		});

		socket.on('looking-for-somebody', (userInfo: any) => {
			if (!isValidUser(userInfo)) {
				console.warn('Dropping looking-for-somebody: invalid payload from socket', socket.id);
				return;
			}

			console.log(`${userInfo.name} is looking for somebody`);
			// find an unpaired offer
			const call = state.calls.find(
				(c: Call) => c.answer === null && c.offerMaker !== socket && !c.paired
			);

			if (call) {
				console.log(`${userInfo.name} is paired with ${call.offerMakerUser.name}`);
				state.stats.totalCallsPaired += 1;
				call.paired = true;
				call.answerMakerUser = userInfo;
				socket.emit('call-found', call.callId);
			} else {
				console.log(`Found no one to pair with ${userInfo.name} at the moment`);
				socket.emit('call-not-found', null);
				state.stats.totalCallsMade += 1;
			}
		});

		socket.on('make-offer', (data: any) => {
			if (!isValidOfferPayload(data)) {
				console.warn('Dropping make-offer: invalid payload from socket', socket.id);
				return;
			}

			state.calls.push({
				callId: data.callId,
				offer: data.offer,
				offerMaker: socket,
				offerMakerUser: data.user,
				answer: null,
				answerMaker: null,
				answerMakerUser: null,
				offerCandidates: [],
				answerCandidates: [],
				paired: false
			});
		});

		socket.on('offerCandidate', (candidate: any) => {
			if (!isValidCandidatePayload(candidate)) {
				console.warn('Dropping offerCandidate: invalid payload from socket', socket.id);
				return;
			}

			const call = state.calls.find((c) => c.callId === candidate.callId);
			if (call) {
				call.offerCandidates.push(candidate);
				const interval = setInterval(() => {
					if (call.answerMaker) {
						call.answerMaker.emit('add-ice-candidate', candidate);
						clearInterval(interval);
					}
				}, 100);
			}
		});

		socket.on('make-answer', (data: any) => {
			if (!isValidAnswerPayload(data)) {
				console.warn('Dropping make-answer: invalid payload from socket', socket.id);
				return;
			}

			const call = state.calls.find((c) => c.callId === data.callId);
			if (call) {
				call.answer = data.answer;
				call.offerMaker.emit('answer-made', data);
			}
		});

		socket.on('answerCandidate', (candidate: any) => {
			if (!isValidCandidatePayload(candidate)) {
				console.warn('Dropping answerCandidate: invalid payload from socket', socket.id);
				return;
			}

			const call = state.calls.find((c) => c.callId === candidate.callId);
			if (call) {
				call.answerCandidates.push(candidate);
				call.offerMaker.emit('add-ice-candidate', candidate);
				// call.answerMaker?.emit('add-ice-candidate', data.offerCandidates);
			}
		});

		socket.on('call-accepted', (data: any) => {
			if (!isValidCallIdPayload(data)) {
				console.warn('Dropping call-accepted: invalid payload from socket', socket.id);
				return;
			}

			console.log('Call Accepted');
			const call = state.calls.find((c) => c.callId === data.callId);
			if (!call) return;

			call.answerMaker = socket;

			// stamp the callId onto both sockets
			call.offerMaker.data.currentCallId = call.callId;
			socket.data.currentCallId = call.callId;

			// send the offer to the answer side
			socket.emit('call-data', JSON.stringify({ callId: data.callId, offer: call.offer }));
		});

		socket.on('who-is-remote', (payload: any) => {
			if (!isValidCallIdPayload(payload)) {
				console.warn('Dropping who-is-remote: invalid payload from socket', socket.id);
				return;
			}

			const call = state.calls.find((c) => c.callId === payload.callId);
			if (call) {
				if (call.offerMaker === socket) {
					socket.emit('remote-user', call.answerMakerUser);
				} else {
					socket.emit('remote-user', call.offerMakerUser);
				}
			}
		});

		socket.on('chat-message', (msg: any) => {
			const isValidMessage =
				typeof msg === 'string' && msg.length > 0 && !exceedsByteLimit(msg, MAX_CHAT_MESSAGE_BYTES);
			if (!isValidMessage) {
				console.warn('Dropping chat-message: invalid or oversized payload from socket', socket.id);
				return;
			}

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
			const target = isOfferer ? call.answerMakerUser : call.offerMakerUser;
			const targetSock = isOfferer ? call.answerMaker! : call.offerMaker;

			console.log(`Message from ${sender.name} to ${target.name}:`, msg);
			targetSock.emit('chat-message-recv', msg);
		});
	});
}
