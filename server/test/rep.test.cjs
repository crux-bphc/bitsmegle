/**
 * Exercises POST /api/users/rep against the real compiled route, with Mongo and
 * Google's userinfo endpoint stubbed out. Throwaway verification harness.
 */
process.env.DB_URI = 'mongodb://localhost:27017/bitsmegle';
process.env.SECRET_CLIENT_ID = 'test-client-id';
process.env.SECRET_CLIENT_SECRET = 'test-client-secret';
process.env.PORT = '0';
process.env.STATS_API_KEY = 'test-stats-key';

const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');

const realFetch = global.fetch.bind(global);

// --- fake user collection -------------------------------------------------
const docs = new Map();
function seed(id, email) {
	docs.set(id, { id, email, name: 'Test User', picture: '', reputation: 0 });
}
const fakeUsers = {
	async findOne(q) {
		return docs.get(q.id) ?? null;
	},
	async insertOne(doc) {
		docs.set(doc.id, doc);
		return { insertedId: doc.id };
	},
	async updateOne(q, update) {
		const doc = docs.get(q.id);
		if (!doc) return { matchedCount: 0, modifiedCount: 0 };
		doc.reputation += update.$inc.reputation;
		return { matchedCount: 1, modifiedCount: 1 };
	}
};

// --- fake Google userinfo -------------------------------------------------
const TOKENS = {
	'tok-alice': { name: 'Alice A', email: 'f20230001@hyderabad.bits-pilani.ac.in', picture: '' },
	'tok-bob': { name: 'Bob B', email: 'f20230002@hyderabad.bits-pilani.ac.in', picture: '' },
	'tok-mallory': { name: 'Mallory M', email: 'f20239999@hyderabad.bits-pilani.ac.in', picture: '' }
};
global.fetch = async (url, opts) => {
	if (String(url).includes('oauth2.googleapis.com/tokeninfo')) {
		const token = new URL(String(url)).searchParams.get('access_token');
		const valid = Object.prototype.hasOwnProperty.call(TOKENS, token);
		return {
			ok: valid,
			json: async () => (valid ? { aud: process.env.SECRET_CLIENT_ID } : { error: 'invalid_token' })
		};
	}
	if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
		const auth = (opts?.headers?.Authorization || '').replace('Bearer ', '');
		const profile = TOKENS[auth];
		return { ok: !!profile, json: async () => (profile ? profile : { error: 'invalid_token' }) };
	}
	return realFetch(url, opts);
};

// --- wire it up -----------------------------------------------------------
const mongoMod = require(path.join(DIST, 'config/mongo'));
mongoMod.users = fakeUsers;

const { app } = require(path.join(DIST, 'app'));
const { state } = require(path.join(DIST, 'services/realtime'));
const { recordPairing, claimRating, PAIRING_TTL_MS } = require(path.join(DIST, 'services/pairings'));

const ALICE = 'f20230001h';
const BOB = 'f20230002h';
const MALLORY = 'f20239999h';
[ALICE, BOB, MALLORY].forEach((id) => seed(id, `${id}@x.y`));

let failures = 0;
function check(name, actual, expected) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

async function rep(base, token, targetId, action, { rawObjectData = false } = {}) {
	// The real client sends `data` as a JSON *string* (the cookie value verbatim).
	const data = rawObjectData ? { access_token: token } : JSON.stringify({ access_token: token });
	const res = await realFetch(`${base}/api/users/rep`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, data, targetId })
	});
	return { status: res.status, body: await res.text() };
}

async function main() {
	const server = app.listen(0);
	await new Promise((r) => server.once('listening', r));
	const base = `http://127.0.0.1:${server.address().port}`;

	console.log('\n--- S2: forging reputation ---');
	// Mallory was never in a call with Bob.
	check('tank a stranger is refused', (await rep(base, 'tok-mallory', BOB, 'dislike')).status, 403);
	check("  ...and Bob's rep is untouched", docs.get(BOB).reputation, 0);

	check('boost self is refused', (await rep(base, 'tok-mallory', MALLORY, 'like')).status, 403);
	check('  ...and own rep is untouched', docs.get(MALLORY).reputation, 0);

	console.log('\n--- input validation ---');
	check('unknown action is rejected', (await rep(base, 'tok-alice', BOB, 'banana')).status, 400);
	check('missing action is rejected', (await rep(base, 'tok-alice', BOB, undefined)).status, 400);
	check('missing targetId is rejected', (await rep(base, 'tok-alice', undefined, 'like')).status, 400);
	check('bad token is 401 not 500', (await rep(base, 'tok-nope', BOB, 'like')).status, 401);

	console.log('\n--- B1: the happy path actually works ---');
	recordPairing('call-1', ALICE, BOB);
	const liked = await rep(base, 'tok-alice', BOB, 'like');
	check('paired like succeeds (was always 500)', liked.status, 200);
	check('  ...and applies +3', docs.get(BOB).reputation, 3);

	check('rating the same call twice is refused', (await rep(base, 'tok-alice', BOB, 'like')).status, 409);
	check('  ...and does not double-apply', docs.get(BOB).reputation, 3);

	console.log('\n--- the other participant, and dislike ---');
	const disliked = await rep(base, 'tok-bob', ALICE, 'dislike');
	check('the peer can rate back', disliked.status, 200);
	check('  ...and dislike applies -1', docs.get(ALICE).reputation, -1);

	console.log('\n--- body shape B1 got wrong ---');
	state.interactions = {};
	recordPairing('call-2', MALLORY, BOB);
	check(
		'data-as-object shape also works',
		(await rep(base, 'tok-mallory', BOB, 'like', { rawObjectData: true })).status,
		200
	);

	console.log('\n--- pairing ledger unit checks ---');
	state.pairings = [];
	recordPairing('c', 'x', 'x');
	check('self-pairing is never recorded', state.pairings.length, 0);

	recordPairing('c', 'x', 'y');
	recordPairing('c', 'x', 'y');
	check('duplicate call-accepted records once', state.pairings.length, 1);
	check('unpaired third party cannot claim', claimRating('z', 'y'), 'not-paired');
	check('participant can claim', claimRating('x', 'y'), 'ok');
	check('but only once', claimRating('x', 'y'), 'already-rated');
	check('the other side still can', claimRating('y', 'x'), 'ok');

	state.pairings = [];
	const stale = Date.now() - PAIRING_TTL_MS - 1000;
	recordPairing('old', 'p', 'q', stale);
	check('expired pairings cannot be claimed', claimRating('p', 'q'), 'not-paired');
	check('  ...and are pruned', state.pairings.length, 0);

	server.close();
	console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
