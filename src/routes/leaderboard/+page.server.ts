import { users } from '../../db/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const data = await users.find({}).sort({ reputation: -1 }).limit(10).toArray();

	const serializableData = data.map((item) => ({
		...item,
		_id: item._id.toString() // Convert ObjectId to string
	}));

	return {
		data: serializableData
	};
};
