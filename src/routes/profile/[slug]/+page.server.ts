import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import type { User } from '$lib/types';
import { PUBLIC_BACKEND_URI } from '$env/static/public';

/** @type {import('./$types').PageServerLoad} */
export const load: PageServerLoad = async ({ params }): Promise<User> => {
	try {
		const res = await fetch(`${PUBLIC_BACKEND_URI}/api/users/profile/` + params.slug);
		const user: User = await res.json();
		return user;
	} catch (e) {
		error(404, 'Profile Not found');
	}
};
