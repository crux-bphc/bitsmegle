<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/userStore';

	let currentOnlineCount: number = 0;
	const setCurrentOnlineCount = () => {
		fetch('api/users')
			.then((res) => res.json())
			.then((data) => (currentOnlineCount = data.count));
	};

	onMount(() => {
		setCurrentOnlineCount();
		setInterval(() => setCurrentOnlineCount(), 5 * 1000);
	});
</script>

<nav class="flex flex-row items-center justify-between w-full h-[7%] lg:h-[12%] px-5">
	<div class="h-full flex items-center justify-center">
		<img class="h-[50%] mr-3" src="favicon.png" alt="Logo" />
		<h1 class="text-white text-2xl pt-1 lg:text-5xl lg:pb-2">BITSmegle</h1>
	</div>
	<div class="h-full flex flex-row items-center justify-between">
		<div class="py-1 px-2.5 bg-emerald-900 text-emerald-400 rounded-lg mr-4">
			<i class="fas fa-user text-sm"></i> <span>{currentOnlineCount}</span>
		</div>
		<img
			class="h-[60%] rounded-full overflow-hidden"
			src={$user?.picture ||
				'https://static.vecteezy.com/system/resources/previews/019/879/186/original/user-icon-on-transparent-background-free-png.png'}
			alt="Profile"
		/>
	</div>
</nav>
