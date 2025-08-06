<script lang="ts">
	export let data;
	let leaderboardData: any = data.data;

	const getID = (email: string) => {
		return email.split('@')[0] + email.split('@')[1][0];
	};
</script>

<div class="flex justify-center items-center w-full mt-10 px-4">
	<div class="text-white rounded-3xl shadow-2xl bg-slate-900 w-full max-w-3xl p-6">
		<h1 class="text-2xl md:text-3xl font-bold mb-6 text-center">🏆 Reputation Leaderboard</h1>

		<div class="space-y-4">
			{#each leaderboardData as user, i}
				<div
					class="flex items-center justify-between bg-slate-900 hover:bg-slate-800 transition-all duration-200 rounded-xl px-4 py-3 shadow-sm"
				>
					<!-- Left: Rank + Avatar + Name -->
					<div class="flex items-center space-x-4">
						<div class="text-lg font-mono text-yellow-400 w-6 text-center">{i + 1}</div>
						<a href="/profile/{user.id}">
							<img class="w-10 h-10 rounded-full object-cover" src={user.picture} alt={user.name} />
						</a>
						<div class="flex flex-col">
							<a href="/profile/{user.id}" class="text-white font-semibold text-sm md:text-base">
								{user.name}
							</a>
							<span class="text-gray-400 text-xs font-mono">{getID(user.email)}</span>
						</div>
					</div>

					<!-- Right: Reputation -->
					<div class="flex items-center text-yellow-400 font-semibold text-sm md:text-base">
						<i class="fas fa-star mr-1"></i>
						<span>{user.reputation}</span>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
