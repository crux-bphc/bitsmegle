import cookie from 'cookie';
import type { Credentials } from 'google-auth-library';

const MAX_AGE = 60 * 60 * 24 * 7; // 1 week

const COOKIE_OPTIONS = {
	maxAge: MAX_AGE,
	path: '/',
	sameSite: 'strict',
	secure: true
} as const;

/**
 * Splits a Google token response into the two cookies the app runs on:
 * `user`, which the client reads and posts to the backend, and `refresh_token`.
 * The refresh token is long-lived, so it stays httpOnly — anything that can read
 * document.cookie would otherwise walk away with persistent account access.
 */
export const serializeSession = (tokens: Credentials): string[] => {
	const serialized = [
		cookie.serialize(
			'user',
			JSON.stringify({ access_token: tokens.access_token, expiry_date: tokens.expiry_date }),
			{ ...COOKIE_OPTIONS, httpOnly: false }
		)
	];

	if (tokens.refresh_token)
		serialized.push(
			cookie.serialize('refresh_token', tokens.refresh_token, {
				...COOKIE_OPTIONS,
				httpOnly: true
			})
		);

	return serialized;
};
