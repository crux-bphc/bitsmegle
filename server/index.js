import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MongoClient } from 'mongodb';
import cookie from 'cookie';

const DB_URI = process.env.DB_URI;
const SECRET_CLIENT_ID = process.env.SECRET_CLIENT_ID;
const SECRET_CLIENT_SECRET = process.env.SECRET_CLIENT_SECRET;

const client = new MongoClient(DB_URI);

function startMongo() {
	console.log('Starting MongoDB connection');
	return client.connect();
}

startMongo()
	.then(() => {
		console.log('Connected to MongoDB');
	})
	.catch((err) => {
		console.error('Error connecting to MongoDB', err);
	});

const db = client.db('bitsmegle');
const users = db.collection('users');

// import { handler } from '../build/handler.js';

const port = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json());
const server = createServer(app);

const io = new Server(server, {
	cors: {
		origin: ['https://bitsmegle.live', 'https://bitsmegle.vercel.app', 'http://localhost:5173']
	}
});

let userCount = 0;
let calls = [];
let interactions = {}; // {user1: [user2, user3]}

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
	// elapsed time in readable format
	let elapsedTime = new Date() - new Date(stats.serverStartTime);
	let seconds = Math.floor(elapsedTime / 1000);
	let minutes = Math.floor(seconds / 60);
	let hours = Math.floor(minutes / 60);
	let days = Math.floor(hours / 24);
	seconds = seconds % 60;
	minutes = minutes % 60;
	hours = hours % 24;

	let elapsedTimeReadable = `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;

	res.json({ ...stats, elapsedTime, elapsedTimeReadable });
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

app.get('/stats/interactions', (req, res) => {
	// stats (number) of interactions
	let totalInteractions = 0;
	for (let user in interactions) {
		totalInteractions += interactions[user].length;
	}

	res.json({ totalInteractions, interactions });
});

// Main API LOGIC

const getIdFromEmail = (email) => {
	// convert email in the format f20230043@hyderabad.bits-pilani.ac.in to 'f20230043h'
	const id = email.split('@')[0];
	const idParts = email.split('@')[1].split('.');
	const campus = idParts[0];
	return id + campus[0];
};

const addUserToDB = async (user) => {
	// Check if user already exists
	const id = getIdFromEmail(user.email);

	const existingUser = await users.findOne({ id: id });

	if (existingUser) {
		// console.log('User already exists');
	} else {
		// Add user to database
		//
		let data = {
			id: id,
			name: user.name,
			email: user.email,
			picture: user.picture,
			reputation: 0
		};

		await users.insertOne(data);
		console.log('User added to database');
	}
};

const getUserData = async (access_token) => {
	const response = await fetch(
		`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`
	);
	const data = await response.json();
	if (data.name === undefined) {
		return { error: 'Failed to get user data' };
	}
	// convert to titlecase
	data.name = data.name
		.split(' ')
		.map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
		.join(' ');

	// Add user to database
	await addUserToDB(data);
	return data;
};

app.post('/api/users', async (req, res) => {
	let body = req.body;

	if (typeof body.access_token !== 'string') {
		body = JSON.parse(body);
	}

	//console.log(body.access_token);

	// Try fetching user data with access token
	let data = await getUserData(body.access_token);
	if (data.name !== undefined) {
		console.log(data.name, 'has logged in');
		return res.status(200).json({ data: data, cookie: null });
	}
	// Handle expiration error specifically
	console.error('Access token expired, attempting refresh');
	const newTokens = await refreshToken(body.refresh_token);
	newTokens.refresh_token = body.refresh_token; // Preserve the refresh token
	newTokens.expiry_date = Date.now() + newTokens.expires_in * 1000; // Calculate the new expiry date
	data = await getUserData(newTokens.access_token);
	console.log(data.name, 'has logged in (after refresh)');
	const serializedCookie = cookie.serialize('user', JSON.stringify(newTokens), {
		httpOnly: false,
		maxAge: 60 * 60 * 24 * 7, // 1 week
		path: '/',
		sameSite: 'strict',
		secure: true
	});
	// return res.header('Set-Cookie', serializedCookie).status(200).json(data);
	return res.status(200).json({ data: data, cookie: serializedCookie });
});

async function refreshToken(refresh_token) {
	const url = 'https://oauth2.googleapis.com/token'; // Google token endpoint
	const body = new URLSearchParams({
		client_id: SECRET_CLIENT_ID,
		client_secret: SECRET_CLIENT_SECRET,
		refresh_token,
		grant_type: 'refresh_token'
	});

	try {
		const response = await fetch(url, {
			method: 'POST',
			body
		});

		if (!response.ok) {
			throw new Error('Failed to refresh access token');
		}

		const data = await response.json();
		return data; // Return the new data
	} catch (error) {
		console.error('Error refreshing access token:', error);
		throw error; // Re-throw the error for handling in the POST function
	}
}

app.post('/api/rep', async (req, res) => {
	// TODO: Add auth
	try {
		let body = req.body;
		// console.log(typeof body, body);
		if (typeof body.data === 'string') {
			body.data = JSON.parse(body.data);
		}

		// console.log(typeof body, body, typeof body.access_token, body.data.access_token);

		if (typeof body.data.access_token !== 'string') {
			return res.status(400).send('Invalid access token');
		}

		const userData = await getUserData(body.data.access_token);
		const userId = getIdFromEmail(userData.email);
		interactions[userId] = interactions[userId] || [];
		if (interactions[userId].includes(body.targetId)) {
			return res.status(409).send('Already rated this user today!');
		}

		if (body.action === 'like') {
			interactions[userId].push(body.targetId);
			await users.updateOne({ id: body.targetId }, { $inc: { reputation: 3 } });
		} else if (body.action === 'dislike') {
			interactions[userId].push(body.targetId);
			await users.updateOne({ id: body.targetId }, { $inc: { reputation: -1 } });
		}

		res.status(200).send('Success');
	} catch (error) {
		console.error(error);
		res.status(500).send('Internal Server Error');
	}
});

app.get('/api/leaderboard', async (req, res) => {
	try {
		const data = await users.find().sort({ reputation: -1 }).limit(10).toArray();
		const serializableData = data.map((item) => ({
			...item,
			_id: item._id.toString() // Convert ObjectId to string
		}));
		res.status(200).json(serializableData);
	} catch (error) {
		console.error(error);
		res.status(500).send('Internal Server Error');
	}
});

app.get('/api/profile/:id', async (req, res) => {
	try {
		const data = await users.findOne({ id: req.params.id });
		if (data) {
			res.status(200).json({ ...data, _id: data._id.toString() });
		} else {
			res.status(404).send('User not found');
		}
	} catch (error) {
		console.error(error);
		res.status(500).send('Internal Server Error');
	}
});

// Signaling Socket IO Server

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
