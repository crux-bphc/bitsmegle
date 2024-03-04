let waiting: string | null = null;
let waitingUser: User | null = null;

interface User {
	name: String;
	email: String;
	profile: String;
}

interface Call {
	callId: String;
	caller: User | null;
	receiver: User | null;
}
let calls: Array<Call> = [];

export const GET = ({ request }) => {
	const url = new URL(request.url);
	const callId = url.searchParams.get('callId');
	let resp;
	if (!callId) {
		resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), {
			status: 200
		});
	} else {
		let callData = calls.find((call) => {
			return call.callId === callId;
		});
		console.log(
			callId,
			'Call established between',
			callData?.caller?.name,
			'and',
			callData?.receiver?.name
		);
		resp = new Response(JSON.stringify(callData), {
			status: 200
		});
	}
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

export const POST = async ({ request, cookies }) => {
	const userCookie = JSON.parse(JSON.parse(cookies.get('user') || ''));
	const body = await request.json();
	body.user = await getUserData(userCookie.access_token);
	let resp: Response;
	if (waiting === null) {
		console.log(body.id, body.user.name, 'is waiting for someone');
		waiting = body.id;
		waitingUser = body.user;
		resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), { status: 200 });
	} else {
		calls.push({
			callId: waiting,
			caller: waitingUser,
			receiver: body.user
		});
		resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), { status: 200 });
		waiting = null;
		waitingUser = null;
	}
	return resp;
};
