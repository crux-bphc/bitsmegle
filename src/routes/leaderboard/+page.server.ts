import { users } from '../../db/users';
import type { PageServerLoad } from './$types';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	// TODO: Error handling
	const res = await fetch('https://server.bitsmegle.live/api/leaderboard');
	const data: User[] = await res.json();
	return {
		data: data
	};
};
