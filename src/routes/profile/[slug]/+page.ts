import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ params }) {
	if (true) {
		return {
			name: params.slug,
			profile: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=' + params.slug,
			email: 'f20230000@goa.bits-pilani.ac.in'
		};
	}

	error(404, 'Not found');
}
