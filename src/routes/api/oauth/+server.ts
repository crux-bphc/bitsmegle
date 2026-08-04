import { OAuth2Client } from 'google-auth-library';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, REDIRECT_URI } from '$env/static/private';
import { serializeSession } from '$lib/server/session';
import { users } from '../../../db/users';
import type { TokenResponse } from '$lib/types';

// Confirms the access token was issued to this app's OAuth client, not some
// other Google app that also holds the userinfo scope (confused deputy).
const verifyTokenAudience = async (access_token: string) => {
	const response = await fetch(
		`https://oauth2.googleapis.com/tokeninfo?access_token=${access_token}`
	);
	const info = await response.json();
	if (!response.ok || info.aud !== SECRET_CLIENT_ID) {
		throw new Error('Token was not issued for this application');
	}
};

const getUserData = async (access_token: string) => {
	await verifyTokenAudience(access_token);

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
		.map((w: string) => w[0].toUpperCase() + w.substring(1).toLowerCase())
		.join(' ');
	return data;
};

export const GET = async ({ url }) => {
	const redirectURL = REDIRECT_URI + '/api/oauth';

	const code = url.searchParams.get('code');

	//console.log('returned state',state)
	console.log('returned code', code);

	if (!code) {
		return new Response(null, {
			status: 400,
			headers: {
				Location: '/error' // Redirect to an error page
			}
		});
	}

	try {
		const oAuth2Client = new OAuth2Client(SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, redirectURL);
		const r = await oAuth2Client.getToken(code);
		// Make sure to set the credentials on the OAuth2 client.
		oAuth2Client.setCredentials(r.tokens);
		console.info('Tokens acquired.');
		const user = oAuth2Client.credentials;
		console.log('credentials', user);

		// let data = await getUserData(user.access_token);
		const headers = new Headers({ Location: '/talk' });
		for (const c of serializeSession(user)) headers.append('Set-Cookie', c);

		// Create a Response object to redirect the user and set the cookie
		return new Response(null, {
			status: 303,
			headers
		});
	} catch (err) {
		console.error('Error during the OAuth flow', err);
		// Handle errors, possibly redirect to an error page
		return new Response(null, {
			status: 303,
			headers: {
				Location: '/error' // Redirect to an error page
			}
		});
	}
};
