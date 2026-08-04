import { OAuth2Client } from 'google-auth-library';
import cookie from 'cookie';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, REDIRECT_URI } from '$env/static/private';
import { users } from '../../../db/users';
import type { TokenResponse } from '$lib/types';

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

		let userData = JSON.stringify(user);

		// Serialize your user data or a session token into a cookie
		const serializedCookie = cookie.serialize('user', userData, {
			httpOnly: false,
			maxAge: 60 * 60 * 24 * 7, // 1 week
			path: '/',
			sameSite: 'strict',
			secure: true
		});

		// Create a Response object to redirect the user and set the cookie
		return new Response(null, {
			status: 303,
			headers: {
				'Set-Cookie': serializedCookie,
				Location: '/talk'
			}
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
