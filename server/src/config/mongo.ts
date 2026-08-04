import { MongoClient, Db, Collection } from 'mongodb';
import { DB_URI } from './env';
import type { User } from '../models/User';

export const client = new MongoClient(DB_URI);

const DEFAULT_DB_NAME = 'bitsmegle';

/**
 * Reads the database name out of the connection string, so pointing this
 * backend at a different database only takes a change to DB_URI. Falls back to
 * `bitsmegle` when the URI carries no path, which is how it behaved before.
 *
 * Deliberately not using `new URL()`: it throws ERR_INVALID_URL on multi-host
 * URIs such as mongodb://h1:27017,h2:27017/db?replicaSet=rs0.
 *
 * scripts/db-name.mjs carries the same logic for the CLI scripts; keep the two
 * in sync.
 */
export function databaseNameFromUri(uri: string): string {
	const afterScheme = uri.split('://')[1] ?? '';
	const path = afterScheme.split('/')[1] ?? '';
	return path.split('?')[0] || DEFAULT_DB_NAME;
}

export const dbName = databaseNameFromUri(DB_URI);

export let users: Collection<User>;

let dbInstance: Db;

export async function connectDB(): Promise<void> {
	if (!dbInstance) {
		await client.connect();
		dbInstance = client.db(dbName);
		users = dbInstance.collection<User>('users');
		console.log(`MongoDB connected (database: ${dbName})`);
	}
}
