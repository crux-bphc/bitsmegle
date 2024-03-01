let waiting: string | null = null;
let waitingUser: string | null = null;

export const GET = () => {
	let resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), {
		status: 200
	});
	waiting = null;
	waitingUser = null;
	return resp;
};

export const POST = async ({ request }) => {
	const body = await request.json();
	let resp: Response;
	if (waiting === null) {
		waiting = body.id;
		waitingUser = body.user;
		resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), { status: 200 });
	} else {
		resp = new Response(JSON.stringify({ id: waiting, user: waitingUser }), { status: 200 });
	}
	return resp;
};
