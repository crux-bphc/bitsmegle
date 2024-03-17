<!-- LeaderboardPage.svelte -->
<script lang="ts">
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
		<div class="flex flex-col mt-3">
			<div class="flex flex-row justify-between">
				<div class="flex flex-row text-gray-500 p-2">
					<div class="w-24">Rank</div>
					<div class="w-60">User</div>
					<div class="w-12">Reputation</div>
				</div>
			</div>
			{#each leaderboardData as user, i}
				<a href="/profile/{user._id}">
					<div class="flex flex-row justify-between leaderboard-row rounded p-2">
						<div class="flex flex-row">
							<div class="w-12">{i + 1}</div>
							<div class="w-12">
								<img class="w-8 h-8 rounded-full" src={user.profile} alt="Profile" />
							</div>
							<div class="w-24 font-semibold">{user.name}</div>
						</div>
						<div class="w-32 text-left">{user.reputation}</div>
						<!-- Increased width and added text-left class -->
					</div>
				</a>
			{/each}
		</div>
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
