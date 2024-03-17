import { startMongo } from './db/mongo';

startMongo().then(() => {
	console.log('MongoDB connected');
});
