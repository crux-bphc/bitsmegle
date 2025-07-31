import { MongoClient, Db, Collection } from 'mongodb';
import { DB_URI } from './env';
import type { User } from '../models/User';

export const client = new MongoClient(DB_URI);

export let users: Collection<User>;

let dbInstance: Db;

export async function connectDB(): Promise<void> {
	if (!dbInstance) {
		await client.connect();
		dbInstance = client.db('bitsmegle');
		users = dbInstance.collection<User>('users');
		console.log('MongoDB connected');
	}
}
