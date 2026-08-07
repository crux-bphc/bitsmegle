/**
 * Exercises the socket signaling call lifecycle against the real compiled
 * handlers, with identity resolution stubbed out. Focus: no call-release path
 * may ever strand the other participant without a `call-ended` notification.
 */
process.env.DB_URI = 'mongodb://localhost:27017/bitsmegle';
process.env.SECRET_CLIENT_ID = 'test-client-id';
process.env.SECRET_CLIENT_SECRET = 'test-client-secret';
process.env.PORT = '0';
process.env.STATS_API_KEY = 'test-stats-key';

const path = require('path');
const http = require('http');
const DIST = path.join(__dirname, '..', 'dist');

// --- fake identities ------------------------------------------------------
const IDENTITIES = {
	'tok-alice': { id: 'f20230001h', name: 'Alice A', email: 'a@x.y', picture: '' },
	'tok-bob': { id: 'f20230002h', name: 'Bob B', email: 'b@x.y', picture: '' },
	'tok-carol': { id: 'f20230003h', name: 'Carol C', email: 'c@x.y', picture: '' }
};
const identityMod = require(path.join(DIST, 'services/identity'));
identityMod.identify = async (token) => {
	const identity = IDENTITIES[token];
	if (!identity) throw new Error('invalid token');
	return identity;
};

const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');
const signaling = require(path.join(DIST, 'sockets/signaling')).default;
const { state } = require(path.join(DIST, 'services/realtime'));

let failures = 0;
function check(name, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`
	);
}

/** Resolves with the next `event` payload, or rejects after `timeoutMs`. */
function waitFor(socket, event, timeoutMs = 2000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`timed out waiting for '${event}'`));
		}, timeoutMs);
		const handler = (payload) => {
			clearTimeout(timer);
			resolve(payload);
		};
		socket.once(event, handler);
	});
}

/** Resolves true if `event` does NOT arrive within `ms`. */
function expectSilence(socket, event, ms = 300) {
	return new Promise((resolve) => {
		const handler = () => {
			clearTimeout(timer);
			resolve(false);
		};
		const timer = setTimeout(() => {
			socket.off(event, handler);
			resolve(true);
		}, ms);
		socket.once(event, handler);
	});
}

const OFFER = { sdp: 'fake-offer-sdp', type: 'offer' };
const ANSWER = { sdp: 'fake-answer-sdp', type: 'answer' };

async function join(base, token) {
	const socket = connectClient(base, { auth: { token }, transports: ['websocket'] });
	await waitFor(socket, 'connect');
	return socket;
}

/** Runs the full offer → search → accept → answer flow; `offerer` ends up paired with `answerer`. */
async function pair(offerer, answerer, callId) {
	const notFound = waitFor(offerer, 'call-not-found');
	offerer.emit('looking-for-somebody');
	await notFound;
	offerer.emit('make-offer', { callId, offer: OFFER });

	const found = waitFor(answerer, 'call-found');
	answerer.emit('looking-for-somebody');
	check(`${callId}: answerer is matched`, await found, callId);

	const callData = waitFor(answerer, 'call-data');
	answerer.emit('call-accepted', { callId });
	check(`${callId}: accepted answerer receives the offer`, JSON.parse(await callData).offer.sdp, OFFER.sdp);

	const answerMade = waitFor(offerer, 'answer-made');
	answerer.emit('make-answer', { callId, answer: ANSWER });
	check(`${callId}: offerer receives the answer`, (await answerMade).answer.sdp, ANSWER.sdp);
}

async function main() {
	const httpServer = http.createServer();
	const io = new Server(httpServer);
	signaling(io);
	httpServer.listen(0);
	await new Promise((r) => httpServer.once('listening', r));
	const base = `http://127.0.0.1:${httpServer.address().port}`;

	const alice = await join(base, 'tok-alice');
	const bob = await join(base, 'tok-bob');
	const carol = await join(base, 'tok-carol');

	console.log('\n--- anonymous sockets cannot take part in calls ---');
	const anon = connectClient(base, { transports: ['websocket'] });
	await waitFor(anon, 'connect');
	const authRequired = waitFor(anon, 'auth-required');
	anon.emit('looking-for-somebody');
	check('anonymous search triggers auth-required', await authRequired, 'looking-for-somebody');
	anon.disconnect();

	console.log('\n--- happy path: full pairing flow ---');
	await pair(alice, bob, 'call-1');
	check('pairing ledger has exactly one entry', state.pairings.length, 1);
	check(
		'  ...for the two server-derived ids',
		[...state.pairings[0].participants].sort(),
		['f20230001h', 'f20230002h']
	);

	console.log('\n--- ICE relay between participants ---');
	const bobIce = waitFor(bob, 'add-ice-candidate');
	alice.emit('offerCandidate', { callId: 'call-1', candidate: { candidate: 'a-cand' } });
	check('offer candidate reaches the answerer', (await bobIce).candidate.candidate, 'a-cand');

	const aliceIce = waitFor(alice, 'add-ice-candidate');
	bob.emit('answerCandidate', { callId: 'call-1', candidate: { candidate: 'b-cand' } });
	check('answer candidate reaches the offerer', (await aliceIce).candidate.candidate, 'b-cand');

	console.log('\n--- non-participants cannot inject into a call ---');
	const bobSilent = expectSilence(bob, 'add-ice-candidate');
	carol.emit('offerCandidate', { callId: 'call-1', candidate: { candidate: 'evil' } });
	check('outsider offerCandidate is dropped', await bobSilent, true);

	const aliceSilentIce = expectSilence(alice, 'add-ice-candidate');
	carol.emit('answerCandidate', { callId: 'call-1', candidate: { candidate: 'evil' } });
	check('outsider answerCandidate is dropped', await aliceSilentIce, true);

	const aliceSilentAnswer = expectSilence(alice, 'answer-made');
	carol.emit('make-answer', { callId: 'call-1', answer: ANSWER });
	check('outsider make-answer is dropped', await aliceSilentAnswer, true);

	const bobSilentEnd = expectSilence(bob, 'call-ended');
	carol.emit('end-call', { callId: 'call-1' });
	check('outsider end-call is dropped', await bobSilentEnd, true);
	check('  ...and the call survives', state.calls.has('call-1'), true);

	console.log('\n--- REGRESSION: make-offer while paired must notify the peer ---');
	const bobEnded = waitFor(bob, 'call-ended');
	alice.emit('make-offer', { callId: 'call-2', offer: OFFER });
	check('peer is told the call ended', await bobEnded, { callId: 'call-1', reason: 'replaced' });
	check('  ...old call is gone', state.calls.has('call-1'), false);
	check('  ...new offer exists', state.calls.has('call-2'), true);

	console.log('\n--- REGRESSION: searching while paired must notify the peer ---');
	// Bob answers Alice's fresh offer so they are paired on call-2.
	const found2 = waitFor(bob, 'call-found');
	bob.emit('looking-for-somebody');
	check('call-2: answerer is matched', await found2, 'call-2');
	const callData2 = waitFor(bob, 'call-data');
	bob.emit('call-accepted', { callId: 'call-2' });
	await callData2;
	// Carol parks an unpaired offer, then Alice searches away from call-2.
	const carolNotFound = waitFor(carol, 'call-not-found');
	carol.emit('looking-for-somebody');
	await carolNotFound;
	carol.emit('make-offer', { callId: 'call-3', offer: OFFER });
	const bobEnded2 = waitFor(bob, 'call-ended');
	const aliceFound = waitFor(alice, 'call-found');
	alice.emit('looking-for-somebody');
	check('searcher is matched elsewhere', await aliceFound, 'call-3');
	check('abandoned peer is told', await bobEnded2, { callId: 'call-2', reason: 'replaced' });
	check('  ...old call is gone', state.calls.has('call-2'), false);

	console.log('\n--- end-call notifies with reason ended ---');
	const callData3 = waitFor(alice, 'call-data');
	alice.emit('call-accepted', { callId: 'call-3' });
	await callData3;
	const carolEnded = waitFor(carol, 'call-ended');
	alice.emit('end-call', { callId: 'call-3' });
	check('peer gets ended reason', await carolEnded, { callId: 'call-3', reason: 'ended' });
	check('  ...call is gone', state.calls.has('call-3'), false);

	console.log('\n--- disconnect notifies with reason peer-disconnected ---');
	await pair(bob, alice, 'call-4');
	const aliceEnded = waitFor(alice, 'call-ended');
	bob.disconnect();
	check('peer gets peer-disconnected reason', await aliceEnded, {
		callId: 'call-4',
		reason: 'peer-disconnected'
	});
	check('  ...call is gone', state.calls.has('call-4'), false);

	console.log('\n--- leaving clears queued ICE relays with the call ---');
	const notFound5 = waitFor(alice, 'call-not-found');
	alice.emit('looking-for-somebody');
	await notFound5;
	alice.emit('make-offer', { callId: 'call-5', offer: OFFER });
	// No answerer yet, so this relay is parked on a retry interval.
	alice.emit('offerCandidate', { callId: 'call-5', candidate: { candidate: 'parked' } });
	await new Promise((r) => setTimeout(r, 150));
	alice.emit('end-call', { callId: 'call-5' });
	await new Promise((r) => setTimeout(r, 150));
	check('abandoned offer is gone', state.calls.has('call-5'), false);
	const carolFindsNothing = waitFor(carol, 'call-not-found');
	carol.emit('looking-for-somebody');
	await carolFindsNothing;
	check('abandoned offer is unmatchable', state.calls.size, 0);
	const carolSilent = expectSilence(carol, 'add-ice-candidate');
	check('no stale relay ever fires', await carolSilent, true);

	check('pairing ledger recorded once per accepted call', state.pairings.length, 4);

	alice.disconnect();
	carol.disconnect();
	io.close();
	httpServer.close();
	console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
