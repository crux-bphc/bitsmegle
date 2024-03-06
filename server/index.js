import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// import { handler } from '../build/handler.js';

const port = 3000;
const app = express();
app.use(cors());
const server = createServer(app);

const io = new Server(server, {
	cors: {
		origin: '*'
	}
});

let userCount = 0;
let calls = [];

io.on('connection', (socket) => {
	console.log('WS: User connected');
	userCount += 1;
	io.sockets.emit('userCountChange', userCount);
	socket.on('disconnect', () => {
		console.log('WS: User disconnected');
		userCount -= 1;
		io.sockets.emit('userCountChange', userCount);
	});

	socket.on('make-offer', (data) => {
		console.log('WS: Offer Made');

		calls.push({
			callId: data.callId,
			offer: data.offer,
			offerMaker: socket,
			answer: null,
			answerMaker: null,
			offerCandidates: [],
			answerCandidates: []
		});
	});

	socket.on('offerCandidate', (data) => {
		console.log('WS: Offer Candidate received');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.offerCandidates.push(data.candidate);
			call.answerMaker?.emit('add-ice-candidate', data);
		}
	});

	socket.on('make-answer', (data) => {
		console.log('WS: Answer Made');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answer = data.answer;
			call.offerMaker.emit('answer-made', data);
		}
	});

	socket.on('answerCandidate', (data) => {
		console.log('WS: Answer Candidate');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answerCandidates = data.candidate;
			call.offerMaker.emit('add-ice-candidate', data);
		}
	});

	socket.on('call-accepted', (data) => {
		console.log('WS: Call Accepted');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answerMaker = socket;
			call.answerMaker.emit(
				'call-data',
				JSON.stringify({ callId: data.callId, offer: call.offer })
			);
		}
	});
});

// SvelteKit should handle everything else using Express middleware
// https://github.com/sveltejs/kit/tree/master/packages/adapter-node#custom-server
// app.use(handler);

server.listen(port);
