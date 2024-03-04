<script lang="ts">
	import { onMount } from 'svelte';
	import { user, remoteUser } from '$lib/stores/userStore';
	import { localStream, remoteStream } from '$lib/stores/streamStore';

	export let who: 'you' | 'them' = 'you';

	$: currentUser = who === 'you' ? user : remoteUser;
	let storeStream = who === 'you' ? localStream : remoteStream;
	let videoElement: HTMLVideoElement;
	let nameplate: HTMLDivElement;

	const hideNameplateLater = () => {
		setTimeout(() => {
			nameplate.classList.add('hidden');
		}, 10000);
	};

	const handleNameplateClick = () => {
		nameplate.classList.remove('hidden');
		hideNameplateLater();
	};
	onMount(() => {
		hideNameplateLater();

		storeStream.subscribe((stream: MediaStream | null) => {
			console.log(stream);

			videoElement.srcObject = stream;
		});

		currentUser.subscribe((user) => {
			if (user) {
				videoElement.classList.remove('hidden');
			} else {
				videoElement.classList.add('hidden');
			}
		});
	});
</script>

<div class="relative h-[45%] w-[90%] lg:h-[90%] lg:w-[48%] rounded-3xl overflow-hidden">
	<div
		class="backdrop-blur-sm absolute flex flex-col rounded-lg left-0 bottom-0 z-10 m-3 px-3 py-2"
		bind:this={nameplate}
	>
		{#if $currentUser}
			<h2 class="text-sm lg:text-xl text-gray-200">{$currentUser.name}</h2>
			<h2 class="text-xs lg:text-sm text-gray-300">{$currentUser.email}</h2>
		{/if}
	</div>

	{#if who === 'you'}
		<video
			class="object-cover w-full h-full camera"
			bind:this={videoElement}
			on:click={handleNameplateClick}
			autoplay
			playsinline
			muted
		>
			<!-- Dummy track for accessibility -->
			<track kind="captions" />
		</video>
	{:else}
		<video
			class="object-cover w-full h-full hidden camera"
			bind:this={videoElement}
			on:click={handleNameplateClick}
			autoplay
			playsinline
		>
			<!-- Dummy track for accessibility -->
			<track kind="captions" />
		</video>

		<video class="object-cover w-full h-full" autoplay loop>
			<source src="loading.mp4" />
			<!-- Dummy track for accessibility -->
			<track kind="captions" />
		</video>
	{/if}
</div>

<style>
	.camera {
		transform: rotateY(180deg);
		-webkit-transform: rotateY(180deg); /* Safari and Chrome */
		-moz-transform: rotateY(180deg); /* Firefox */
	}
</style>
