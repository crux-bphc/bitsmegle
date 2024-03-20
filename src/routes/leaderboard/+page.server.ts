import { users } from '../../db/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	// TODO: Error handling
	const serializableData = await fetch('https://server.bitsmegle.live/api/leaderboard');

	return {
		data: serializableData
	};
};
