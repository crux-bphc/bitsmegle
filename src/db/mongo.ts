import { MongoClient } from 'mongodb';
import { DB_URI } from '$env/static/private';

const client = new MongoClient(DB_URI);

export function startMongo(): Promise<MongoClient> {
	console.log('Starting MongoDB connection');
	return client.connect();
}

export default client.db();
