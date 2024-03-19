<script lang="ts">
	import { onMount } from 'svelte';
	import logo from '$lib/assets/logo.png';
	import Particles from '../components/Particles.svelte';
	import Loader from '../components/Loader.svelte';
	import { writable } from 'svelte/store';
	let countdown = '';

	let timerInterval: any;
	$: loaded = writable(false);
	$: countdownOn = true;

	onMount(() => {
		// Calculate the time remaining until 7 days from now
		const deadline = new Date(2024, 2, 20, 22, 0, 0);

		// const deadline = new Date(2024, 2, 19, 10, 58, 0);
		// Function to update the countdown timer
		function updateCountdown() {
			const now = new Date();
			const timeLeft = deadline - now;
			if (timeLeft < 0) {
				clearInterval(timerInterval);
				countdown = 'Launched!';
				countdownOn = false;
				return;
			}

			const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
			const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
			const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

			countdown = `${days}d ${hours}h ${minutes}m ${seconds}s`;
		}

		// Update the countdown every second
		timerInterval = setInterval(updateCountdown, 1000);
	});
</script>

<Particles {loaded} />

{#if !$loaded}
	<Loader color="dark" />
{:else}
	<div class="flex flex-col justify-center items-center h-full">
		<div class="flex flex-col justify-center items-center z-10">
			<div class="h-full flex items-center justify-center">
				<img class="h-16 mr-3" src={logo} alt="Logo" />
				<h1 class="text-white text-5xl pt-1 lg:pt-2 lg:text-7xl lg:pb-2">
					<span class="font-semibold font-sans">BITS</span><span class="font-cursive">megle</span>
				</h1>
			</div>
			<div class="text-gray-400 text-3xl font-serif mt-4 mb-6 tagline">
				Kabhi online intro diya hai kya?
			</div>
			{#if countdownOn}
				<div class="text-white text-xl font-serif m-2">Launching soon...</div>
				<div class="text-white text-xl font-serif m-2">{countdown}</div>
			{:else}
				<button
					class="px-6 py-3 bg-gray-200 text-black font-semibold rounded-lg hover:bg-gray-500 transition duration-300"
				>
					<a href="/signup">Get Started</a>
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.tagline {
		font-family: 'Reenie Beanie', cursive;
		font-weight: 400;
	}
</style>
