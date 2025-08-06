<script lang="ts">
	import { socket } from '$lib/stores/socketStore';
	import { remoteUser } from '$lib/stores/userStore';
	import { writable } from 'svelte/store';
	import type { Message } from '$lib/types';
	import { createEventDispatcher, afterUpdate } from 'svelte';

	let messagesContainer: HTMLDivElement;

	afterUpdate(() => {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	export let drawer = writable(false);
	let messages: Message[] = [];
	$: messages = [...messages];

	const handleMessageSubmit = (target: EventTarget | null) => {
		const message = (target as HTMLInputElement).value;
		const timestamp = Date.now();
		messages = [...messages, { sender: 'You', message, timestamp }];
		(target as HTMLInputElement).value = '';
		$socket?.emit('chat-message', message);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		const target = e.target as HTMLInputElement;
		if (e.key === 'Enter' && target?.value !== '') {
			handleMessageSubmit(e.target);
		}
	};

	const dispatch = createEventDispatcher();

	$socket?.on('chat-message-recv', (message: string) => {
		dispatch('newMessage');
		const timestamp = Date.now();
		messages = [...messages, { sender: $remoteUser?.name || 'Unknown', message, timestamp }];
	});
</script>

<!-- CHAT DRAWER -->
<div
	class="fixed top-0 left-0 z-50 h-full w-[90%] sm:w-[400px] transition-transform duration-300 transform"
	class:translate-x-0={$drawer}
	class:-translate-x-full={!$drawer}
	tabindex="-1"
>
	<div class="relative flex flex-col h-full bg-slate-900/90 overflow-hidden rounded-r-2xl">
		<!-- Close Button -->
		<button class="absolute top-1 right-1 p-2 text-white" on:click={() => drawer.set(false)}>
			<i class="fas fa-close" />
		</button>

		<!-- Header -->
		<div class="text-xl font-semibold text-center text-white bg-slate-800/90 py-3">Chat</div>

		<!-- Messages -->
		<div
			bind:this={messagesContainer}
			class="flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-start space-y-2"
		>
			{#each messages as message}
				<div
					class={`relative max-w-[80%] min-w-[40%] px-4 py-3 text-sm break-words text-white backdrop-blur-md shadow-lg 
        ${
					message.sender === 'You'
						? 'bg-blue-600/30 self-end rounded-br-none'
						: 'bg-slate-700/30 self-start rounded-bl-none'
				} 
        rounded-xl`}
				>
					<div class="flex justify-between text-xs text-gray-300 mb-1">
						<span class="font-semibold">{message.sender}</span>
					</div>

					<span>{message.message}</span>

					{#if message.timestamp}
						<div class="text-[0.65rem] text-gray-300 mt-1 text-right">
							{new Date(message.timestamp).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit'
							})}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Input -->
		<div class="p-3 border-t border-slate-700 bg-slate-900">
			<input
				class="w-full bg-slate-800 text-white px-4 py-2 rounded-full focus:outline-none text-sm placeholder-gray-400"
				placeholder="Type a message and press Enter"
				on:keydown={handleKeyDown}
			/>
		</div>
	</div>
</div>
