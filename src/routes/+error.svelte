<script>
	import { page } from '$app/stores';
	import logo from '../lib/assets/logo.png';
	console.log($page.error?.message);
</script>

<div class="flex flex-col items-center justify-center h-[80%] text-white">
	<div class="bg-slate-900 p-6 rounded-xl text-white text-center">
		<span class="text-xl font-semibold">ERROR!</span>
		<h1>{$page.error?.message}</h1>
	</div>
</div>
