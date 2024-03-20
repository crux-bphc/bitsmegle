import { users } from '../../db/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	// TODO: Error handling
	const res = await fetch('https://server.bitsmegle.live/api/leaderboard');
	const data = await res.json();
	return {
		data: data
	};
};
