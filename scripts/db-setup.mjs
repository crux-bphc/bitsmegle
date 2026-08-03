// Prepares the local `bitsmegle` database: creates the collections and indexes
// the app relies on, and optionally inserts sample users.
//
//   node scripts/db-setup.mjs           indexes only
//   node scripts/db-setup.mjs --seed    indexes + sample users
//
// Safe to re-run: index creation and seeding are both idempotent.
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { databaseNameFromUri } from './db-name.mjs';

dotenv.config();

const DB_URI = process.env.DB_URI || 'mongodb://127.0.0.1:27017/bitsmegle';
const seed = process.argv.includes('--seed');

// Both the frontend and the backend take the database name from the URI, so
// this script has to resolve it the same way.
const dbName = databaseNameFromUri(DB_URI);

const SAMPLE_USERS = [
	{
		id: 'f20230001h',
		name: 'Ada Lovelace',
		email: 'f20230001@hyderabad.bits-pilani.ac.in',
		picture: 'https://placehold.co/96x96?text=AL',
		reputation: 42
	},
	{
		id: 'f20230002h',
		name: 'Alan Turing',
		email: 'f20230002@hyderabad.bits-pilani.ac.in',
		picture: 'https://placehold.co/96x96?text=AT',
		reputation: 21
	},
	{
		id: 'f20230003p',
		name: 'Grace Hopper',
		email: 'f20230003@pilani.bits-pilani.ac.in',
		picture: 'https://placehold.co/96x96?text=GH',
		reputation: 7
	}
];

const client = new MongoClient(DB_URI, { serverSelectionTimeoutMS: 5000 });

try {
	await client.connect();
	const db = client.db(dbName);
	console.log(`Connected to ${dbName} at ${DB_URI}`);

	const users = db.collection('users');

	// `id` is the natural key used by every lookup in routes/users.ts.
	await users.createIndex({ id: 1 }, { unique: true, name: 'id_unique' });
	// GET /api/users/leaderboard sorts by reputation descending.
	await users.createIndex({ reputation: -1 }, { name: 'reputation_desc' });
	console.log('Indexes ready:', (await users.indexes()).map((i) => i.name).join(', '));

	if (seed) {
		await users.bulkWrite(
			SAMPLE_USERS.map((user) => ({
				updateOne: { filter: { id: user.id }, update: { $setOnInsert: user }, upsert: true }
			}))
		);
		console.log(`Seeded ${SAMPLE_USERS.length} sample users`);
	}

	console.log(`users collection holds ${await users.countDocuments()} document(s)`);
} finally {
	await client.close();
}
