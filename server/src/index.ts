// src/index.ts (or server.ts)
import { connectDB } from './config/mongo';
import { app } from './app';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { PORT } from './config/env';
import signaling from './sockets/signaling';

async function bootstrap() {
	await connectDB();

	const httpServer = createServer(app);
	const io = new IOServer(httpServer, {
		cors: {
			origin: ['https://bitsmegle.live', 'https://bitsmegle.vercel.app', 'http://localhost:5173']
		}
	});
	signaling(io);

	httpServer.listen(+PORT, () => {
		console.log(`App listening on port ${PORT}`);
	});
}

bootstrap().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
