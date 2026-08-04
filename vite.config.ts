import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Read .env here so FRONTEND_PORT can move the dev server, which is what lets
	// two worktrees run at the same time. A --port flag still wins over this.
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [sveltekit()],
		server: {
			port: Number(env.FRONTEND_PORT) || 5173
		},
		ssr: {
			noExternal: ['tsparticles', '@tsparticles/slim', '@tsparticles/engine', '@tsparticles/svelte'] // add all tsparticles libraries here, they're not made for SSR, they're client only
		}
	};
});
