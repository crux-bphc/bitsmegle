import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// import { handler } from '../build/handler.js';

const port = process.env.PORT || 3000;
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

let stats = {
	totalUsersConnected: 0,
	maxActiveUserCount: 0,
	totalCallsMade: 0,
	totalCallsPaired: 0,
	serverStartTime: new Date().toISOString()
};

app.get('/', (req, res) => {
	res.send('Welcome to Bitsmegle!');
});

app.get('/stats', (req, res) => {
	res.json(stats);
});

app.get('/stats/user-count', (req, res) => {
	res.json({ userCount });
});

app.get('/stats/calls', (req, res) => {
	// stats (number) of calls

	// total number of calls
	let total = calls.length;

	// number of calls that are not paired
	let notPaired = calls.filter((call) => !call.paired).length;

	// number of calls that are paired
	let paired = calls.filter((call) => call.paired).length;

	// number of calls that are not answered
	let notAnswered = calls.filter((call) => call.answer === null).length;

	// number of calls that are answered
	let answered = calls.filter((call) => call.answer !== null).length;

	res.json({ total, notPaired, paired, notAnswered, answered });
});

io.on('connection', (socket) => {
	// console.log('User connected');
	userCount += 1;
	stats.totalUsersConnected += 1;
	stats.maxActiveUserCount = Math.max(stats.maxActiveUserCount, userCount);
	io.sockets.emit('userCountChange', userCount);
	socket.on('disconnect', () => {
		// console.log('User disconnected');
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
			stats.totalCallsPaired += 1;
			call.paired = true;
			call.answerMakerUser = data;
			socket.emit('call-found', call.callId);
		} else {
			console.log('Found no one to pair with', data.name, 'at the moment');
			socket.emit('call-not-found', null);
			stats.totalCallsMade += 1;
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
			call.offerCandidates.push(data);
			let interval = setInterval(() => {
				if (call.answerMaker) {
					call.answerMaker.emit('add-ice-candidate', data);
					clearInterval(interval);
				}
			}, 100);
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
			// call.answerMaker?.emit('add-ice-candidate', data.offerCandidates);
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
server.listen(port, () => {
	console.log(`App listening on port: ${port}`);
});
