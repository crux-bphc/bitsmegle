import { users } from '../../db/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const data = await users.find({}, { limit: 5 }).toArray();
	console.log('data', data);

	const serializableData = data.map((item) => ({
		...item,
		_id: item._id.toString() // Convert ObjectId to string
	}));

	return {
		data: serializableData
	};
};
