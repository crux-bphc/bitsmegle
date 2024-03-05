import { Server } from 'socket.io';
import { type ViteDevServer } from 'vite';

export const configureServer = (server: ViteDevServer) => {
	if (!server.httpServer) return;

	const io = new Server(server.httpServer);

	let userCount = 0;

	io.on('connection', (socket) => {
		console.log('User connected');
		userCount += 1;
		io.sockets.emit('userCountChange', userCount);
		socket.on('disconnect', () => {
			console.log('User disconnected');
			userCount -= 1;
			io.sockets.emit('userCountChange', userCount);
		});
	});
};

export const webSocketServer = {
	name: 'webSocketServer',
	configureServer
};
