<script lang="ts">
	import '../app.css';
	import Nav from '../components/Nav.svelte';

	import { page } from '$app/stores';

	import { user } from '$lib/stores/userStore';

	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let route = $page.url.pathname.slice($page.url.pathname.lastIndexOf('/'));

	const parseCookie = (cookieString: string): Record<string, string> => {
		const cookies: Record<string, string> = {};
		cookieString.split(';').forEach((cookie) => {
			const [cookieName, cookieValue] = cookie
				.split('=')
				.map((part) => decodeURIComponent(part.trim()));
			cookies[cookieName] = cookieValue || '';
		});
		return cookies;
	};

	onMount(() => {
		// Assuming you have a function to parse cookies
		const userData = parseCookie(document.cookie).user;
		if (userData) {
			fetch('/api/users', {
				method: 'POST',
				body: JSON.parse(userData),
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then((res) => res.json())
				.then((data) => user.set(data));
		} else if (route != '/signup') {
			return goto('/signup');
		}
	});
</script>

<Nav />

<slot />
