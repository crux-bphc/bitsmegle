import { Router, Request, Response } from 'express';
import cookie from 'cookie';

import { users } from '../config/mongo';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET } from '../config/env';
import { state } from '../services/realtime';
import type { User, TokenResponse } from '../models/User';
const router = Router();

/**
 * Converts email (f20230043@hyderabad.bits-pilani.ac.in) → 'f20230043h'
 */
function getIdFromEmail(email: string): string {
	const [local, domain] = email.split('@');
	const campus = domain.split('.')[0];
	return `${local}${campus.charAt(0)}`;
}

/**
 * Ensures a user document exists in Mongo
 */
async function addUserToDB(user: User): Promise<void> {
	const id = getIdFromEmail(user.email);
	const existing = await users.findOne({ id });
	if (!existing) {
		await users.insertOne({
			id,
			name: user.name,
			email: user.email,
			picture: user.picture,
			reputation: 0
		});
	}
}

/**
 * Fetches Google userinfo and ensures DB entry
 */
async function getUserData(accessToken: string): Promise<User> {
	const resp = await fetch(
		`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`
	);
	const data = await resp.json();
	if (!data.name) throw new Error('Failed to fetch user data');

	// Title-case name
	data.name = data.name
		.split(' ')
		.map((w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');

	await addUserToDB(data as User);
	return data as User;
}

/**
 * Refreshes Google OAuth token
 */
async function refreshToken(refreshToken: string): Promise<TokenResponse> {
	const url = 'https://oauth2.googleapis.com/token';
	const body = new URLSearchParams({
		client_id: SECRET_CLIENT_ID,
		client_secret: SECRET_CLIENT_SECRET,
		refresh_token: refreshToken,
		grant_type: 'refresh_token'
	});

	const resp = await fetch(url, { method: 'POST', body });
	if (!resp.ok) throw new Error('Token refresh failed');
	return (await resp.json()) as TokenResponse;
}

// POST /users
// Login or refresh Google user
router.post('/', async (req: Request, res: Response) => {
	try {
		const payload = typeof req.body.access_token === 'string' ? req.body : JSON.parse(req.body);

		let user = await getUserData(payload.access_token);
		let cookieHeader: string | null = null;

		// If expired, refresh
		if (!user.name) {
			const tokens = await refreshToken(payload.refresh_token);
			tokens.refresh_token = payload.refresh_token;
			tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
			user = await getUserData(tokens.access_token);
			cookieHeader = cookie.serialize('user', JSON.stringify(tokens), {
				httpOnly: false,
				maxAge: 60 * 60 * 24 * 7,
				path: '/',
				sameSite: 'strict',
				secure: true
			});
		}

		if (cookieHeader) res.setHeader('Set-Cookie', cookieHeader);
		return res.status(200).json({ data: user, cookie: cookieHeader });
	} catch (err) {
		console.error(err);
		return res.status(401).send('Authentication failed');
	}
});

// POST /rep
// Like/dislike another user
router.post('/rep', async (req: Request, res: Response) => {
	try {
		const { data, targetId, action } =
			typeof req.body.data === 'string' ? JSON.parse(req.body) : req.body;

		if (typeof data.access_token !== 'string') return res.status(400).send('Missing access token');

		const user = await getUserData(data.access_token);
		const userId = getIdFromEmail(user.email);
		state.interactions[userId] = state.interactions[userId] || [];

		if (state.interactions[userId].includes(targetId))
			return res.status(409).send('Already rated today');

		state.interactions[userId].push(targetId);
		const delta = action === 'like' ? 3 : -1;
		await users.updateOne({ id: targetId }, { $inc: { reputation: delta } });

		return res.status(200).send('Success');
	} catch (err) {
		console.error(err);
		return res.status(500).send('Server error');
	}
});

// GET /leaderboard
router.get('/leaderboard', async (_req: Request, res: Response) => {
	try {
		const docs = await users.find().sort({ reputation: -1 }).limit(10).toArray();
		const sanitized = docs.map((d) => ({ ...d, _id: d._id.toString() }));
		res.json(sanitized);
	} catch (err) {
		console.error(err);
		res.status(500).send('Server error');
	}
});

// GET /profile/:id
router.get('/profile/:id', async (req: Request, res: Response) => {
	try {
		const doc = await users.findOne({ id: req.params.id });
		if (!doc) return res.status(404).send('Not found');
		res.json({ ...doc, _id: doc._id.toString() });
	} catch (err) {
		console.error(err);
		res.status(500).send('Server error');
	}
});

export default router;
