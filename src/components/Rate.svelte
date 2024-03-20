<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	import { remoteUser } from '$lib/stores/userStore';

	$: user = remoteUser;

	const getIdFromEmail = (email: string) => {
		// convert email in the format f20230043@hyderabad.bits-pilani.ac.in to 'f20230043h'
		const id = email.split('@')[0];
		const idParts = email.split('@')[1].split('.');
		const campus = idParts[0];
		return id + campus[0];
	};

	const updateUser = async (action: 'like' | 'dislike') => {
		const response = await fetch(`https://server.bitsmegle.live/api/rep`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action,
				targetId: getIdFromEmail($user?.email)
			})
		});
		if (!response.ok) {
			console.error('Failed to update user');
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

		dispatch('interaction', { user, button });
	};
</script>

<div
	class="relative h-[45%] w-[90%] land:h-[85%] land:w-[48%] lg:h-[90%] lg:w-[48%] rounded-3xl overflow-hidden"
>
	<div class="flex w-full h-full items-center justify-center bg-gray-900">
		<div class="flex flex-col text-center">
			<div class="text-2xl text-white font-semibold mb-4">Rate {$user?.name}</div>
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
						<a href="/report?email={$user?.email}">
							<i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>Report
						</a>
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
