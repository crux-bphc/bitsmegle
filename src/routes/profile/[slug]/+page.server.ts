import { error } from '@sveltejs/kit';
import { users } from '../../../db/users';
import type { PageServerLoad } from './$types.js';

/** @type {import('./$types').PageServerLoad} */
export const load: PageServerLoad = async ({ params }) => {
	try {
		const user = await fetch('https://server.bitsmegle.live/api/profile/' + params.slug);
		return user;
	} catch (e) {
		error(404, 'Profile Not found');
	}
};
