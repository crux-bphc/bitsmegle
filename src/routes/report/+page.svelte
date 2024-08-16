<script lang="ts">
	import { user } from '$lib/stores/userStore';

	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	export let form;

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
		const userData = parseCookie(document.cookie).user;

		if (userData) {
			fetch('https://server.bitsmegle.live/api/users', {
				method: 'POST',
				body: userData,
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then((res) => res.json())
				.then((data) => {
					// user.set(data);
					console.log('user', data.data);
					userName = data.data.name;
					userEmail = data.data.email;
				});
		} else {
			return goto('/signup');
		}
	});

	let email: string | null, report: string;
	let userName, userEmail;

	email = $page.url.searchParams.get('email');

	const submitReport = () => {
		console.log(email, report);
	};
</script>

<div
	class="bg-gray-900 text-white p-8 m-8 text-wrap rounded-lg flex flex-col justify-center items-center max-w-[400px] mx-auto"
>
	<h1 class="text-3xl font-bold mb-2">Report User</h1>
	{#if form?.success}
		<p class="text-md text-green-300 text-center mb-3">Report submitted successfully.</p>
	{/if}
	<p class="text-md text-gray-300 text-center mb-3">
		We are sorry for the inconvenience. Please report the issue to us.
	</p>
	<form class="flex flex-col items-center justify-center space-y-4 text-black" method="POST">
		<input
			type="email"
			name="reporterEmail"
			placeholder="Your email"
			class="w-80 p-2 rounded-lg hidden"
			bind:value={userEmail}
		/>
		<input
			type="text"
			name="reporterName"
			placeholder="Your name"
			class="w-80 p-2 rounded-lg hidden"
			bind:value={userName}
		/>
		<input
			type="email"
			name="reporteeEmail"
			placeholder="User's email"
			class="w-80 p-2 rounded-lg"
			bind:value={email}
		/>
		<textarea placeholder="Describe the incident" name="message" class="w-80 p-2 rounded-lg"
		></textarea>
		<button type="submit" class="bg-blue-500 text-white p-2 rounded-lg w-80"> Submit </button>
	</form>
</div>
