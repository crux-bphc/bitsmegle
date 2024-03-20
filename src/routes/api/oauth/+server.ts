import { OAuth2Client } from 'google-auth-library';
import cookie from 'cookie';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, REDIRECT_URI } from '$env/static/private';
import { users } from '../../../db/users';

const getUserData = async (access_token: string) => {
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
	return data;
};

export const GET = async ({ url }) => {
	const redirectURL = REDIRECT_URI + '/api/oauth';

	const code = await url.searchParams.get('code');

	//console.log('returned state',state)
	console.log('returned code', code);

	try {
		const oAuth2Client = new OAuth2Client(SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, redirectURL);
		const r = await oAuth2Client.getToken(code);
		// Make sure to set the credentials on the OAuth2 client.
		oAuth2Client.setCredentials(r.tokens);
		console.info('Tokens acquired.');
		const user = oAuth2Client.credentials;
		console.log('credentials', user);

		// let data = await getUserData(user.access_token);
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
