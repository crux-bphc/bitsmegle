<!-- LeaderboardPage.svelte -->
<script lang="ts">
	export let data;
	let leaderboardData: any = data.data;
	// onMount(async () => {
	// 	leaderboardData = await fetchRandomUsers(5); // Fetching 5 random users
	// });

	const getID = (email: string) => {
		return email.split('@')[0] + email.split('@')[1][0];
	};
</script>

<div class=" flex justify-center items-center w-full mt-10">
	<div class="text-white rounded-3xl shadow-2xl bg-slate-900 w-[80%] md:w-[800px] h-full p-6">
		<div class="text-3xl mb-8 mt-3 font-bold">Leaderboard</div>

		<table class="min-w-full table-fixed">
			<thead class="text-gray-400">
				<tr>
					<th scope="col" class="p-0 md:p-2 text-left text-[10px] md:text-xs font-medium uppercase"
						>Rank</th
					>
					<th scope="col" class="p-4 text-left text-[10px] md:text-xs font-medium uppercase"
						>User</th
					>
					<!-- <th
						scope="col"
						class="p-4 text-left text-xs font-medium uppercase text-gray-400"
					></th> -->
					<th
						scope="col"
						class="md:hidden block p-4 text-left text-[10px] md:text-xs font-medium uppercase"
						>Rep</th
					>
					<th
						scope="col"
						class="hidden md:block p-4 text-left text-[10px] md:text-xs font-medium uppercase"
						>Reputation</th
					>
				</tr>
			</thead>
			<tbody class="">
				{#each leaderboardData as user, i}
					<tr class="hover:bg-gray-700">
						<td
							class="bg-slate whitespace-nowrap p-4 font-mono text-[10px] md:text-sm md:m font-medium text-slate-500"
							>{i + 1}</td
						>
						<td class="flex items-center space-x-6 whitespace-nowrap md:px-4 py-4">
							<a href="/profile/{user.id}">
								<img
									class="md:w-10 md:h-10 w-8 h-8 rounded-full object-cover object-right"
									src={user.picture}
									alt=""
								/>
							</a>
							<div class="text-[10px] md:text-sm font-normal text-gray-400">
								<a href="/profile/{user.id}">
									<div class="md:hidden block font-semibold text-white">
										{user.name.split(' ')[0]}
									</div>
									<div class="hidden md:block font-semibold text-white">
										{user.name}
									</div>
									<div class="text-[8px] md:text-sm font-normal text-gray-400">
										{getID(user.email)}
									</div></a
								>
							</div>
						</td>
						<!-- <td class="space-x-2 whitespace-nowrap">
						
					</td> -->
						<td class="text-[10px] md:text-sm space-x-2 whitespace-nowrap p-4 text-white">
							<i class="text-yellow-500 fas fa-star"></i>
							<span>{user.reputation}</span></td
						>
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
