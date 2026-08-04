import { users } from '../config/mongo';
import { SECRET_CLIENT_ID } from '../config/env';
import type { User } from '../models/User';

/**
 * The subset of a user record that the server derives itself from a verified
 * Google token. Never accepted from a client payload.
 */
export interface Identity {
	id: string;
	name: string;
	email: string;
	picture: string;
}

/**
 * Converts email (f20230043@hyderabad.bits-pilani.ac.in) → 'f20230043h'
 */
export function getIdFromEmail(email: string): string {
	const [local, domain] = email.split('@');
	const campus = domain.split('.')[0];
	return `${local}${campus.charAt(0)}`;
}

/**
 * Ensures a user document exists in Mongo
 */
export async function addUserToDB(user: User): Promise<void> {
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
 * Confirms the access token was issued to this app's OAuth client, not some
 * other Google app that also holds the userinfo scope (confused deputy).
 */
async function verifyTokenAudience(accessToken: string): Promise<void> {
	const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
	const info = await resp.json();
	if (!resp.ok || info.aud !== SECRET_CLIENT_ID) {
		throw new Error('Token was not issued for this application');
	}
}

/**
 * Fetches Google userinfo and ensures DB entry
 */
export async function getUserData(accessToken: string): Promise<User> {
	await verifyTokenAudience(accessToken);

	const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	const data = await resp.json();
	if (!data.name) throw new Error('Failed to fetch user data');

	// Title-case name
	data.name = data.name
		.split(' ')
		.filter((w: string) => w.length > 0)
		.map((w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');

	await addUserToDB(data as User);
	return data as User;
}

/**
 * Sockets re-authenticate on every reconnect, and this app explicitly asks
 * users to be on mobile data, so reconnects are frequent. Cache the resolved
 * identity briefly rather than calling Google for each one. Short enough that
 * it does not meaningfully extend the life of a token that stopped working.
 */
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const identityCache = new Map<string, { identity: Identity; cachedAt: number }>();

/**
 * Verifies an access token and returns the server-derived identity for it.
 * This — not anything in a request or socket payload — is the only source of
 * truth for "who is this".
 */
export async function identify(accessToken: string): Promise<Identity> {
	const now = Date.now();
	const hit = identityCache.get(accessToken);
	if (hit && now - hit.cachedAt < IDENTITY_CACHE_TTL_MS) return hit.identity;

	const user = await getUserData(accessToken);
	const identity: Identity = {
		id: getIdFromEmail(user.email),
		name: user.name,
		email: user.email,
		picture: user.picture
	};

	for (const [token, entry] of identityCache) {
		if (now - entry.cachedAt >= IDENTITY_CACHE_TTL_MS) identityCache.delete(token);
	}
	identityCache.set(accessToken, { identity, cachedAt: now });
	return identity;
}
