<script lang="ts">
	import { socket } from '$lib/stores/socketStore';
	import { remoteUser } from '$lib/stores/userStore';
	interface Message {
		sender: string;
		message: string;
	}

	let messages: Message[] = [];
	$: messages = [...messages];

	const handleMessageSubmit = (target: EventTarget | null) => {
		const message = (target as HTMLInputElement).value;
		messages = [{ sender: 'You', message }, ...messages];
		(target as HTMLInputElement).value = '';

		console.log(message);
		$socket?.emit('chat-message', message);
	};

	$socket?.on('chat-message-recv', (message: string) => {
		messages = [{ sender: $remoteUser?.name, message }, ...messages];
	});
</script>

<div class="relative h-[150%] w-[48%] hidden md:block">
	<div
		class="w-full h-[85%] bg-slate-800 rounded-t-3xl flex flex-col-reverse p-1 py-5 overflow-y-scroll overflow-x-hidden"
	>
		{#each messages as message}
			<p class="w-full h-[20%] p-3 text-gray-300">
				<span class="text-blue-300">{message.sender}: </span>{message.message}
			</p>
		{/each}
	</div>
	<input
		class="w-full bg-slate-700 text-gray-300 px-5 rounded-b-3xl outline-none text-sm p-1"
		placeholder="Type message and hit ENTER to send"
		on:keydown={(e) => {
			if (e.key === 'Enter') {
				handleMessageSubmit(e.target);
			}
		}}
	/>
</div>
