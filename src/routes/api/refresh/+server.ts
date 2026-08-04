import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET } from '$env/static/private';
import { serializeSession } from '$lib/server/session';

/**
 * Refreshes the Google access token. Lives here rather than on the backend
 * because the refresh token is httpOnly and only ever leaves the browser on a
 * same-origin request.
 */
export const POST = async ({ cookies }) => {
	const refresh_token = cookies.get('refresh_token');

	if (!refresh_token) {
		return new Response(null, { status: 401 });
	}

	try {
		const response = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: SECRET_CLIENT_ID,
				client_secret: SECRET_CLIENT_SECRET,
				refresh_token,
				grant_type: 'refresh_token'
			})
		});

		if (!response.ok) {
			return new Response(null, { status: 401 });
		}

		const tokens = await response.json();

		const headers = new Headers();
		for (const c of serializeSession({
			access_token: tokens.access_token,
			expiry_date: Date.now() + tokens.expires_in * 1000,
			// Google does not return a new refresh token, so re-issue the current one
			refresh_token
		}))
			headers.append('Set-Cookie', c);

		return new Response(null, { status: 204, headers });
	} catch (err) {
		console.error('Error refreshing the access token', err);
		return new Response(null, { status: 401 });
	}
};
