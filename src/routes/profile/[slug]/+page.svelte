<script lang="ts">
	export let data: any;
</script>

<div id="profile" class="flex flex-col items-center justify-center bg-slate-900 mx-10 text-white">
	<h1 class="text-3xl font-bold mb-6">Profile</h1>

	<div class="flex flex-col items-center space-y-4">
		<h2 class="text-xl font-bold">Welcome, {data.name}</h2>
		<p class="text-gray-400">Email: {data.email}</p>
		<img src={data.profile} alt="Profile" class="rounded-full w-20 h-20" />
	</div>
</div>
