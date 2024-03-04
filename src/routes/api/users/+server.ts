import { SECRET_CLIENT_ID, SECRET_CLIENT_SECRET, REDIRECT_URI } from '$env/static/private';
import cookie from 'cookie';

let userCount: number = 0;

export const GET = () => {
	userCount += 1;
	setTimeout(() => {
		userCount -= 1;
	}, 4 * 1000); // 5-1 sec;
	let resp = new Response(JSON.stringify({ count: userCount }), {
		status: 200
	});
	return resp;
};

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

export const POST = async ({ request }) => {
	const body = await request.json();

	// Try fetching user data with access token

	let data = await getUserData(body.access_token);
	if (data.name !== undefined) {
		console.log(data.name, 'has logged in');
		return new Response(JSON.stringify(data), { status: 200 });
	}
	// Handle expiration error specifically
	// Refresh logic goes here
	console.error('Access token expired, attempting refresh');
	// Replace with your refresh token logic
	// This section needs to be implemented based on your authentication flow
	// It should fetch a new access token using a refresh token and retry
	// getUserData with the new token
	const newTokens = await refreshToken(body.refresh_token);
	data = await getUserData(newTokens.access_token);
	console.log(data.name, 'has logged in (after refresh)');
	const serializedCookie = cookie.serialize('user', JSON.stringify(newTokens), {
		httpOnly: false,
		maxAge: 60 * 60 * 24 * 7, // 1 week
		path: '/',
		sameSite: 'strict',
		secure: true
	});
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { 'Set-Cookie': serializedCookie }
	});
};

async function refreshToken(refresh_token: string) {
	const url = 'https://oauth2.googleapis.com/token'; // Google token endpoint
	const body = new URLSearchParams({
		client_id: SECRET_CLIENT_ID, // Replace with your client ID
		client_secret: SECRET_CLIENT_SECRET, // Replace with your client secret
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
