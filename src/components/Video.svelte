<script lang="ts">
	import { onMount } from 'svelte';
	import Loader from './Loader.svelte';
	import { currentStatus } from '$lib/stores/statusStore';
	import { user, remoteUser } from '$lib/stores/userStore';
	import { localStream, remoteStream } from '$lib/stores/streamStore';

	export let who: 'you' | 'them' = 'you';

	$: status = $currentStatus;
	$: currentUser = who === 'you' ? user : remoteUser;
	let storeStream = who === 'you' ? localStream : remoteStream;
	let videoElement: HTMLVideoElement | null;
	let nameplate: HTMLDivElement | null;

	const hideNameplateLater = () => {
		setTimeout(() => {
			if (nameplate) nameplate.classList.add('hidden');
		}, 10000);
	};

	const handleNameplateClick = () => {
		if (nameplate) nameplate.classList.remove('hidden');
		hideNameplateLater();
	};
	onMount(() => {
		hideNameplateLater();

		storeStream.subscribe((stream: MediaStream | null) => {
			// console.log(stream);

			if (videoElement) videoElement.srcObject = stream;
			hideNameplateLater();
		});

		currentUser.subscribe((user) => {
			if (user) {
				videoElement?.classList.remove('hidden');
			} else {
				videoElement?.classList.add('hidden');
			}
		});
	});

	const emailToId = (email: string) => {
		return email.split('@')[0] + email.split('@')[1][0];
	};
</script>

<div
	class="relative h-[45%] w-[90%] land:h-[85%] land:w-[48%] lg:h-[90%] lg:w-[48%] rounded-3xl overflow-hidden"
>
	<div
		class="backdrop-blur-sm absolute flex flex-col rounded-lg left-0 bottom-0 z-10 m-3 px-3 py-2"
		bind:this={nameplate}
	>
		{#if $currentUser}
			<a href="/profile/{emailToId($currentUser.email)}" target="_blank">
				<h2 class="text-sm lg:text-xl text-gray-200">{$currentUser.name}</h2>
				<h2 class="text-xs lg:text-sm text-gray-300">{$currentUser.email}</h2>
			</a>
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

		<!-- <video class="object-cover w-full h-full" autoplay loop>
			<source src="loading.mp4" />
			<track kind="captions" />
		</video> -->

		{#if status[0] === 'F'}
			<Loader />
		{:else}
			<div class="bg-slate-900 w-full h-full flex items-center justify-center">
				<img src="loader.png" alt="Loader" class="scale-[55%]" />
			</div>
		{/if}
	{/if}
</div>

<style>
	.camera {
		transform: rotateY(180deg);
		-webkit-transform: rotateY(180deg); /* Safari and Chrome */
		-moz-transform: rotateY(180deg); /* Firefox */
	}
</style>
