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
		origin: ['https://bitsmegle.live', 'https://bitsmegle.vercel.app', 'http://localhost:5173']
	}
});

let userCount = 0;
let calls = [];

io.on('connection', (socket) => {
	console.log('User connected');
	userCount += 1;
	io.sockets.emit('userCountChange', userCount);
	socket.on('disconnect', () => {
		console.log('User disconnected');
		userCount -= 1;
		// remove calls that are not paired (stale)
		calls = calls.filter((call) => !call.paired && call.offerMaker !== socket);
		io.sockets.emit('userCountChange', userCount);
	});

	socket.on('looking-for-somebody', (data) => {
		console.log(data.name, 'is looking for somebody');
		// find a call maker who is also looking for somebody
		let call = calls.find(
			(call) => call.answer === null && call.offerMaker !== socket && !call.paired
		);

		if (call) {
			console.log(data.name, 'is paired with', call.offerMakerUser.name);
			call.paired = true;
			call.answerMakerUser = data;
			socket.emit('call-found', call.callId);
		} else {
			console.log('Found no one to pair with', data.name, 'at the moment');
			socket.emit('call-not-found', null);
		}
	});

	socket.on('make-offer', (data) => {
		// console.log('Offer Made');

		calls.push({
			callId: data.callId,
			offer: data.offer,
			offerMaker: socket,
			offerMakerUser: data.user,
			answer: null,
			answerMaker: null,
			answerMakerUser: null,
			offerCandidates: [],
			answerCandidates: [],
			paired: false
		});
	});

	socket.on('offerCandidate', (data) => {
		// console.log(' Offer Candidate received');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.offerCandidates.push(data.candidate);
			call.answerMaker?.emit('add-ice-candidate', data);
		}
	});

	socket.on('make-answer', (data) => {
		// console.log(' Answer Made');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answer = data.answer;
			call.offerMaker.emit('answer-made', data);
		}
	});

	socket.on('answerCandidate', (data) => {
		// console.log(' Answer Candidate');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answerCandidates = data.candidate;
			call.offerMaker.emit('add-ice-candidate', data);
		}
	});

	socket.on('call-accepted', (data) => {
		console.log(' Call Accepted');
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			call.answerMaker = socket;
			call.answerMaker.emit(
				'call-data',
				JSON.stringify({ callId: data.callId, offer: call.offer })
			);
		}
	});

	socket.on('who-is-remote', (data) => {
		let call = calls.find((call) => call.callId === data.callId);
		if (call) {
			// offerMakerUser if user is answerMakerUser and vice versa
			if (call.offerMaker === socket) {
				socket.emit('remote-user', call.answerMakerUser);
			} else {
				socket.emit('remote-user', call.offerMakerUser);
			}
		}
	});
});

// SvelteKit should handle everything else using Express middleware
// https://github.com/sveltejs/kit/tree/master/packages/adapter-node#custom-server
// app.use(handler);

server.listen(port);
