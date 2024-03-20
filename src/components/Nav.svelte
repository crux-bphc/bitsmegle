<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/userStore';
	import { socket } from '$lib/stores/socketStore';
	import { io } from 'socket.io-client';
	import logo from '$lib/assets/logo.png';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	$: currentOnlineCount = 1;
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

	// email to id
	const emailToId = (email: string) => {
		return email.split('@')[0] + email.split('@')[1][0];
	};

	// const setCurrentOnlineCount = () => {
	// 	fetch('api/users')
	// 		.then((res) => res.json())
	// 		.then((data) => (currentOnlineCount = data.count));
	// };

	const checkExpiration = (userData: string) => {
		if (userData && JSON.parse(userData).expiry_date < Date.now()) {
			fetch('https://server.bitsmegle.live/api/users', {
				method: 'POST',
				body: userData,
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}
	};

	onMount(() => {
		if ($socket === null) {
			socket.set(
				// io('https://2887-2401-4900-62ed-6df5-181a-bb1d-fba1-2a22.ngrok-free.app', {
				// 	extraHeaders: {
				// 		'ngrok-skip-browser-warning': '1'
				// 	}
				// })
				io('wss://server.bitsmegle.live', {
					// extraHeaders: {
					// 	'ngrok-skip-browser-warning': '1'
					// }
				})
			);

			$socket?.on('eventFromServer', (message) => {
				console.log(message);
			});

			$socket?.on('userCountChange', (count) => {
				// console.log('changed to', count);
				currentOnlineCount = count;
			});
		}
		// setCurrentOnlineCount();
		// setInterval(() => setCurrentOnlineCount(), 5 * 1000); // Every 5 seconds
		const userData = parseCookie(document.cookie).user;
		setInterval(() => checkExpiration(userData), 10 * 60 * 1000); // Every 10 minutes
	});
</script>

<nav
	class=" flex flex-row items-center justify-between w-full h-[7%] lg:h-[12%] px-5 {$page.route
		.id === '/'
		? 'hidden'
		: ''}"
>
	<button class="h-full flex items-center justify-center" on:click={() => goto('/')}>
		<img class="h-[50%] mr-3" src={logo} alt="Logo" />
		<h1 class="text-white text-2xl pt-1 lg:pt-2 lg:text-5xl lg:pb-2">
			<span class="font-semibold font-sans">BITS</span><span class="font-cursive">megle</span>
		</h1>
	</button>

	<div class="h-full flex flex-row items-center justify-between">
		<button
			class="py-1 px-2.5 bg-gray-900 hover:bg-gray-500 text-gray-500 hover:text-gray-900 rounded-lg mr-4"
		>
			<a href="/leaderboard">
				<i class="fas fa-ranking-star text-md"></i>
			</a>
		</button>
		<div class="py-1 px-2.5 bg-emerald-900 text-emerald-400 rounded-lg mr-4">
			<i class="fas fa-user text-sm"></i> <span>{currentOnlineCount}</span>
		</div>
		{#if $user}
			<a class="h-[60%] lg:h-[50%]" href="/profile/{emailToId($user.email)}">
				<img
					class="h-full rounded-full overflow-hidden"
					src={$user?.picture ||
						'https://static.vecteezy.com/system/resources/previews/019/879/186/original/user-icon-on-transparent-background-free-png.png'}
					alt="Profile"
				/></a
			>
		{/if}
	</div>
</nav>
