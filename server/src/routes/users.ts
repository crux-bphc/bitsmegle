import { Router, Request, Response } from 'express';
import cookie from 'cookie';

import { users } from '../config/mongo';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET } from '../config/env';
import { state } from '../services/realtime';
import { getUserData, identify } from '../services/identity';
import { claimRating } from '../services/pairings';
import type { TokenResponse } from '../models/User';
const router = Router();

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
// Like/dislike a user you were actually just in a call with.
router.post('/rep', async (req: Request, res: Response) => {
	let body: any;
	let credentials: any;
	try {
		body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
		// The client stores the token response as a JSON string in a cookie and
		// forwards it verbatim, so `data` arrives as a string, not an object.
		credentials = typeof body?.data === 'string' ? JSON.parse(body.data) : body?.data;
	} catch {
		return res.status(400).send('Malformed request body');
	}

	const { targetId, action } = body ?? {};

	if (action !== 'like' && action !== 'dislike')
		return res.status(400).send("action must be 'like' or 'dislike'");
	if (typeof targetId !== 'string' || targetId.length === 0)
		return res.status(400).send('Missing targetId');
	if (typeof credentials?.access_token !== 'string')
		return res.status(400).send('Missing access token');

	// Who the caller is comes from the verified token, never from the body.
	let userId: string;
	try {
		userId = (await identify(credentials.access_token)).id;
	} catch (err) {
		console.error(err);
		return res.status(401).send('Authentication failed');
	}

	if (userId === targetId) return res.status(403).send('Cannot rate yourself');

	try {
		state.interactions[userId] = state.interactions[userId] || [];
		if (state.interactions[userId].includes(targetId))
			return res.status(409).send('Already rated today');

		// The caller must actually have been paired with the target by this server.
		const claim = claimRating(userId, targetId);
		if (claim === 'not-paired')
			return res.status(403).send('You have not been in a call with this user');
		if (claim === 'already-rated') return res.status(409).send('Already rated this call');

		const delta = action === 'like' ? 3 : -1;
		const result = await users.updateOne({ id: targetId }, { $inc: { reputation: delta } });
		if (result.matchedCount === 0) return res.status(404).send('No such user');

		state.interactions[userId].push(targetId);
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
