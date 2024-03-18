<!-- LeaderboardPage.svelte -->
<script lang="ts">
	import { user } from '$lib/stores/userStore';
import { onMount } from 'svelte';

	// Function to fetch random users from the API
	const fetchRandomUsers = async (count: number) => {
		try {
			const response = await fetch(`https://randomuser.me/api/?results=${count}`);
			if (!response.ok) {
				throw new Error('Failed to fetch random users');
			}
			const data = await response.json();
			return data.results.map((user: any, index: any) => ({
				id: index + 1,
				pfp: user.picture.thumbnail,
				name: `${user.name.first} ${user.name.last}`,
				email: user.email,
				reputation: Math.floor(Math.random() * 500) // Generating random reputation
			}));
		} catch (error) {
			console.error('Error fetching random users:', error);
			return [];
		}
	};

	export let data;
	let leaderboardData: any = data.data;
	// onMount(async () => {
	// 	leaderboardData = await fetchRandomUsers(5); // Fetching 5 random users
	// });
</script>

<div class="container mx-auto max-w-[50%] m-6 flex justify-center items-center">
	<div class="text-white rounded bg-slate-900 w-full h-full p-6">
		<div class="text-xl mb-3 p-2 font-bold">Leaderboard</div>

		<hr />

		<table class="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-600">
			<thead class="bg-gray-100 dark:bg-gray-700">
				<tr>
					<th
						scope="col"
						class="p-4 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
						>No.</th
					>
					<th
						scope="col"
						class="p-4 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
						>Name</th
					>
					<th
						scope="col"
						class="p-4 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
					></th>
					<th
						scope="col"
						class="p-4 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
						>Reputation</th
					>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
				{#each leaderboardData as user, i}
				<tr class="hover:bg-gray-100 dark:hover:bg-gray-700">
					<td
						class="bg-slate whitespace-nowrap p-4 font-mono text-sm font-medium text-gray-900 dark:text-slate-500"
						>{i+1}</td
					>
					<td class="mr-12 flex items-center space-x-6 whitespace-nowrap p-4">
						<a href="/profile/{user.id}">
							<img
								class="w-10 rounded-full object-cover object-right"
								src={user.picture}
								alt=""
							/>
						</a>
						<div class="text-sm font-normal text-gray-500 dark:text-gray-400">
							<div class="text-base font-semibold text-gray-900 dark:text-white">{user.name}</div>
						</div>
					</td>
					<td class="space-x-2 whitespace-nowrap">
						<img
							class="w-4 rounded-full object-cover object-right"
							src="https://i.imgur.com/1XYOJHg.png"
							alt=""
						/>
					</td>
					<td class="space-x-2 whitespace-nowrap p-4 text-white">{user.reputation}</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;

	/* Additional custom styles */
	.leaderboard-row:hover {
		background-color: rgba(255, 255, 255, 0.05);
	}
</style>
