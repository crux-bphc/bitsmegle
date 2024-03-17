import { error } from '@sveltejs/kit';
import { users } from '../../../db/users';
import type { PageServerLoad } from './$types.js';

/** @type {import('./$types').PageServerLoad} */
export const load: PageServerLoad = async ({ params }) => {
	const user = await users.findOne({ id: params.slug });
	if (user) {
		return { ...user, _id: user._id.toString() };
	}

	error(404, 'Profile Not found');
};
