<script lang="ts">
	import { socket } from '$lib/stores/socketStore';
	import { remoteUser } from '$lib/stores/userStore';
	import { writable } from 'svelte/store';
	import type { Message } from '$lib/types';

	export let drawer = writable(false);
	let messages: Message[] = [];
	$: messages = [...messages];

	const handleMessageSubmit = (target: EventTarget | null) => {
		const message = (target as HTMLInputElement).value;
		messages = [{ sender: 'You', message }, ...messages];
		(target as HTMLInputElement).value = '';

		console.log(message);
		$socket?.emit('chat-message', message);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		const target = e.target as HTMLInputElement;
		if (e.key === 'Enter' && target?.value !== '') {
			handleMessageSubmit(e.target);
		}
	};

	$socket?.on('chat-message-recv', (message: string) => {
		messages = [{ sender: $remoteUser?.name || 'Unknown', message }, ...messages];
	});
</script>

<!-- drawer component -->
<div
	id="drawer-example"
	class="fixed top-0 left-0 z-40 h-full p-4 overflow-y-auto transition-transform {$drawer &&
		'-translate-x-full'} bg-white w-[85%] dark:bg-gray-900 opacity-[98%]"
	tabindex="-1"
	aria-labelledby="drawer-label"
>
	<div class="relative h-full">
		<button
			class="absolute top-2 right-2 p-2 rounded-full bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
			on:click={() => drawer.set(!$drawer)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
		<div
			class="w-full h-[90%] bg-slate-800 rounded-t-3xl flex flex-col-reverse p-1 py-5 overflow-y-scroll overflow-x-hidden"
		>
			{#each messages as message}
				<p class="w-full text-lg p-3 text-gray-300">
					<span class="text-blue-300">{message.sender}: </span>{message.message}
				</p>
			{/each}
		</div>
		<input
			class="w-full bg-slate-700 text-gray-300 px-5 rounded-b-3xl outline-none text-lg p-2"
			placeholder="Type message and hit ENTER"
			on:keydown={handleKeyDown}
		/>
	</div>
</div>
