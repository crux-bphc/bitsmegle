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
	// convert to titlecase
	data.name = data.name
		.split(' ')
		.map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
		.join(' ');
	return data;
};

export const POST = async ({ request }) => {
	const body = await request.json();
	let data = await getUserData(body.access_token);
	// TODO: Handle expiriation
	console.log(data.name, 'has logged in');
	return new Response(JSON.stringify(data), { status: 200 });
};
