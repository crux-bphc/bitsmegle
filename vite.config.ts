import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketServer } from './src/wsserver';

export default defineConfig({
	plugins: [sveltekit()]
});
