import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import type { User } from '$lib/types';

/** @type {import('./$types').PageServerLoad} */
export const load: PageServerLoad = async ({ params }): Promise<User> => {
	try {
		const res = await fetch('https://server.bitsmegle.live/api/profile/' + params.slug);
		const user: User = await res.json();
		return user;
	} catch (e) {
		error(404, 'Profile Not found');
	}
};
