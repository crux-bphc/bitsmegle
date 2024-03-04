<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/userStore';

	let currentOnlineCount: number = 0;
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
	const setCurrentOnlineCount = () => {
		fetch('api/users')
			.then((res) => res.json())
			.then((data) => (currentOnlineCount = data.count));
	};

	const checkExpiration = (userData) => {
		if (userData && JSON.parse(JSON.parse(userData)).expiry_date < Date.now()) {
			fetch('/api/users', {
				method: 'POST',
				body: JSON.parse(userData),
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}
	};

	onMount(() => {
		setCurrentOnlineCount();
		setInterval(() => setCurrentOnlineCount(), 5 * 1000); // Every 5 seconds
		const userData = parseCookie(document.cookie).user;
		setInterval(() => checkExpiration(userData), 60 * 1000); // Every minute
	});
</script>

<nav class="flex flex-row items-center justify-between w-full h-[7%] lg:h-[12%] px-5">
	<div class="h-full flex items-center justify-center">
		<img class="h-[50%] mr-3" src="favicon.png" alt="Logo" />
		<h1 class="text-white text-2xl pt-1 lg:pt-2 lg:text-5xl lg:pb-2 font-semibold">
			<span class="font-semibold">BITS</span><span class="font-cursive">megle</span>
		</h1>
	</div>
	<div class="h-full flex flex-row items-center justify-between">
		<div class="py-1 px-2.5 bg-emerald-900 text-emerald-400 rounded-lg mr-4">
			<i class="fas fa-user text-sm"></i> <span>{currentOnlineCount}</span>
		</div>
		{#if $user}
			<img
				class="h-[60%] lg:h-[50%] rounded-full overflow-hidden"
				src={$user?.picture ||
					'https://static.vecteezy.com/system/resources/previews/019/879/186/original/user-icon-on-transparent-background-free-png.png'}
				alt="Profile"
			/>
		{/if}
	</div>
</nav>
