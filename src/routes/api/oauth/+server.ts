import { OAuth2Client } from 'google-auth-library';
import cookie from 'cookie';
import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, REDIRECT_URI } from '$env/static/private';

export const GET = async ({ url }) => {
	const redirectURL = REDIRECT_URI + '/api/oauth';
	console.log(redirectURL);
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
		const userData = JSON.stringify(user);

		// Serialize your user data or a session token into a cookie
		const serializedCookie = cookie.serialize('user', JSON.stringify(userData), {
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
				Location: '/'
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
