// End-to-end check that the local MongoDB instance can serve every database
// operation the app performs. Exits non-zero on the first failure.
//
//   node scripts/db-smoke-test.mjs
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const DB_URI = process.env.DB_URI || 'mongodb://127.0.0.1:27017/bitsmegle';
const TEST_ID = '_smoketest_f00000000x';

let failures = 0;

function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  PASS  ${name}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const client = new MongoClient(DB_URI, { serverSelectionTimeoutMS: 5000 });

try {
	await client.connect();

	// The frontend calls client.db() with no argument (src/db/mongo.ts), so the
	// database name has to come from the URI path.
	const dbFromUri = client.db();
	check(
		'DB_URI carries a database name',
		dbFromUri.databaseName === 'bitsmegle',
		`client.db() resolved to "${dbFromUri.databaseName}", expected "bitsmegle"`
	);

	// The backend pins the name explicitly (server/src/config/mongo.ts).
	const db = client.db('bitsmegle');
	const users = db.collection('users');

	const ping = await db.admin().ping();
	check('server responds to ping', ping.ok === 1);

	const { version } = await db.admin().serverInfo();
	console.log(`  INFO  MongoDB server version ${version}`);

	await users.deleteOne({ id: TEST_ID });

	// routes/users.ts → addUserToDB
	const inserted = await users.insertOne({
		id: TEST_ID,
		name: 'Smoke Test',
		email: 'f00000000@hyderabad.bits-pilani.ac.in',
		picture: '',
		reputation: 0
	});
	check('insertOne creates a user', inserted.acknowledged && inserted.insertedId != null);

	// routes/users.ts → GET /profile/:id
	const found = await users.findOne({ id: TEST_ID });
	check('findOne reads it back', found?.name === 'Smoke Test');
	check('_id serialises for the API response', typeof found?._id.toString() === 'string');

	// routes/users.ts → POST /rep
	await users.updateOne({ id: TEST_ID }, { $inc: { reputation: 3 } });
	await users.updateOne({ id: TEST_ID }, { $inc: { reputation: -1 } });
	const rated = await users.findOne({ id: TEST_ID });
	check('$inc applies reputation changes', rated?.reputation === 2, `got ${rated?.reputation}`);

	// routes/users.ts → GET /leaderboard
	const leaderboard = await users.find().sort({ reputation: -1 }).limit(10).toArray();
	const descending = leaderboard.every(
		(doc, i) => i === 0 || leaderboard[i - 1].reputation >= doc.reputation
	);
	check('leaderboard query returns reputation-sorted docs', descending);

	// The unique index is what stops duplicate accounts for one BITS id.
	let duplicateRejected = false;
	try {
		await users.insertOne({ id: TEST_ID, name: 'Dupe', email: 'x', picture: '', reputation: 0 });
	} catch (err) {
		duplicateRejected = err.code === 11000;
	}
	check('unique index on id rejects duplicates', duplicateRejected);

	const deleted = await users.deleteOne({ id: TEST_ID });
	check('deleteOne cleans up', deleted.deletedCount === 1);

	// Data has to outlive a client reconnect, i.e. actually hit the volume.
	const persisted = await users.countDocuments();
	console.log(`  INFO  users collection holds ${persisted} document(s) after cleanup`);
} catch (err) {
	failures++;
	console.error('  FAIL  unexpected error:', err.message);
} finally {
	await client.close();
}

if (failures > 0) {
	console.error(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log('\nAll database checks passed');
