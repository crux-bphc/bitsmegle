<script lang="ts">
	import { socket } from '$lib/stores/socketStore';
	import { remoteUser } from '$lib/stores/userStore';
	import type { Message } from '$lib/types';

	let messages: Message[] = [];
	$: messages = [...messages];

	const handleMessageSubmit = (target: EventTarget | null) => {
		const message = (target as HTMLInputElement).value.trim();

		if (message !== '') {
			messages = [{ sender: 'You', message }, ...messages];
			(target as HTMLInputElement).value = '';

			console.log(message);
			$socket?.emit('chat-message', message);
		}
	};

	$socket?.on('chat-message-recv', (message: string) => {
		messages = [{ sender: $remoteUser?.name || 'Unknown', message }, ...messages];
	});
</script>

<div class="relative h-[150%] w-[48%] hidden md:block">
	<div
		class="w-full h-[85%] bg-slate-900 rounded-tl-3xl rounded-tr-none flex flex-col-reverse p-2 py-5 overflow-y-scroll wrap-break-anywhere"
	>
		{#each messages as message}
			<p class="w-full h-[20%] p-3 text-gray-300">
				<span class="text-blue-300">{message.sender}: </span>{message.message}
			</p>
		{/each}
	</div>
	<input
		class="w-full bg-slate-800 text-gray-300 px-5 rounded-b-3xl outline-none text-sm p-1"
		placeholder="Type message and hit ENTER to send"
		on:keydown={(e) => {
			if (e.key === 'Enter') {
				handleMessageSubmit(e.target);
			}
		}}
	/>
</div>
