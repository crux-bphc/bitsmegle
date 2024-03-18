/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		fontFamily: {
			cursive: ['Sacramento', 'cursive']
		},
		extend: {
			screens: {
				'land': {'raw': '(orientation: landscape)'}
			}
		}
	},
	plugins: []
};
