import { users } from '../../../db/users';

export const POST = async ({ request }) => {
	// TODO: Add authentication
	let body = await request.json();

	if (body.action === 'like') {
		await users.updateOne({ id: body.targetId }, { $inc: { reputation: 1 } });
	} else if (body.action === 'dislike') {
		await users.updateOne({ id: body.targetId }, { $inc: { reputation: -1 } });
	}

	return new Response('Success', { status: 200 });
};
