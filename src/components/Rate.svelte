<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { PUBLIC_BACKEND_URI } from '$env/static/public';
	const dispatch = createEventDispatcher();

	import { remoteUser } from '$lib/stores/userStore';

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

	const updateUser = async (action: 'like' | 'dislike') => {
		// The id comes from the server via the `remote-user` event, not from a local
		// transform — the backend re-checks it against the pairing it brokered anyway.
		const targetId = $remoteUser?.id;
		if (!targetId) {
			console.error('Could not update user rep: no remote user id');
			return;
		}

		const response = await fetch(`${PUBLIC_BACKEND_URI}/api/users/rep`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action,
				data: parseCookie(document.cookie).user,
				targetId
			})
		});
		if (response.status !== 200 && response.status !== 409) {
			console.error('Could not update user rep:', response.status, await response.text());
		} else if (response.status === 409) {
			console.log('Already liked/disliked user');
		} else if (response.status === 200) {
			console.log('Updated user rep');
		}
	};

	const handleInteraction = async (button: string) => {
		if (button === 'like') {
			console.log('Liked user');
			await updateUser('like');
		} else if (button === 'dislike') {
			console.log('Disliked user');
			await updateUser('dislike');
		}

		dispatch('interaction', { user: $remoteUser, button });
	};
</script>

<div
	class="relative h-[45%] w-[90%] land:h-[85%] land:w-[48%] lg:h-[90%] lg:w-[48%] rounded-3xl overflow-hidden"
>
	<div class="flex w-full h-full items-center justify-center bg-gray-900">
		<div class="flex flex-col text-center">
			<div class="text-2xl text-white font-semibold mb-4">Rate {$remoteUser?.name}</div>
			<div class="grid grid-row-2 gap-4">
				<div class="flex justify-center">
					<button
						class="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-l-md text-md focus:outline-none"
						on:click={() => handleInteraction('like')}
					>
						<i class="fas fa-thumbs-up mr-2"></i> Like
					</button>
					<button
						class="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-r-md text-md focus:outline-none"
						on:click={() => handleInteraction('dislike')}
					>
						<i class="fas fa-thumbs-down mr-2"></i> Dislike
					</button>
				</div>
				<div class="flex justify-center">
					<button
						class="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-l-md text-md focus:outline-none"
						on:click={() => handleInteraction('skip')}
					>
						<i class="fas fa-fast-forward mr-2"></i> Skip
					</button>
					<button
						class="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-r-md text-md focus:outline-none"
					>
						<a href="/report?email={$remoteUser?.email}">
							<i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>Report
						</a>
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
