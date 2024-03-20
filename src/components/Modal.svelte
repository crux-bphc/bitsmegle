<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let isOpen = true;

	function closeModal() {
		isOpen = false;
		dispatch('close');
	}
</script>

<!-- Modal backdrop -->
<div
	class="fixed top-0 left-0 w-full h-full bg-black opacity-50 z-40"
	style="display: {isOpen ? 'block' : 'none'};"
></div>

<!-- Modal content -->
<div
	class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-700 p-6 rounded-md shadow-lg z-50 min-w-[25%] md:w-[40%] w-[90%]"
	style="display: {isOpen ? 'block' : 'none'};"
>
	<!-- Title -->
	<h2 class="text-2xl font-bold mb-4 text-white text-center">Note</h2>

	<!-- Description -->
	<div class="mb-8 text-white">
		<p>📱 For optimal performance:</p>
		<ul class="list-disc ml-10 mb-6">
			<li>Use mobile data instead of LAN for Bitsmegle.</li>
		</ul>
		<p class="text-left">🐛 In case you encounter bugs, try refreshing.</p>
		<p class="text-left ml-6 mt-2">
			If the issue persists please report it on our
			<a href="https://www.facebook.com/groups/322411787096169" class="text-blue-300"
				>facebook community</a
			>.
		</p>
	</div>

	<!-- Close button -->
	<button
		class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none w-full"
		on:click={closeModal}>Close</button
	>
</div>
