<script lang="ts">
	export let userName: string = 'User Name';
	export let userId: string = '2023A7PS0000H';

	import { onMount } from 'svelte';

	export let store: any;
	export let mute: boolean = true;
	let videoElement: HTMLVideoElement;

	onMount(() => {
		store.subscribe((stream: MediaStream) => {
			videoElement.srcObject = stream;
		});
	});
</script>

<div class="relative h-[45%] w-[90%] lg:h-[90%] lg:w-[48%] rounded-3xl overflow-hidden">
	<div
		class="backdrop-blur-md absolute flex flex-col rounded-lg left-0 bottom-0 z-10 m-5 px-3 py-2"
	>
		<h2 class="text-xl text-gray-200">{userName}</h2>
		<h2 class="text-sm text-gray-300">{userId}</h2>
	</div>

	<video class="object-cover w-full h-full" bind:this={videoElement} autoplay muted={mute}>
		<!-- Dummy track for accessibility -->
		<track kind="captions" />
	</video>
</div>

<style>
	video {
		transform: rotateY(180deg);
		-webkit-transform: rotateY(180deg); /* Safari and Chrome */
		-moz-transform: rotateY(180deg); /* Firefox */
	}
</style>
