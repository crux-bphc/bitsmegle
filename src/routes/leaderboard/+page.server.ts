import { users } from '../../db/users';
import type { PageServerLoad } from './$types';
import type { User } from '$lib/types';
import { PUBLIC_BACKEND_URI } from '$env/static/public';

export const load: PageServerLoad = async ({ params }) => {
	// TODO: Error handling
	const res = await fetch(`${PUBLIC_BACKEND_URI}/api/users/leaderboard`);
	const data: User[] = await res.json();
	return {
		data: data
	};
};
