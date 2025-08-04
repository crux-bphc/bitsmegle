<script lang="ts">
	import { onMount } from 'svelte';
	import logo from '$lib/assets/logo.png';
	import Particles from '../components/Particles.svelte';
	import Loader from '../components/Loader.svelte';
	import { writable } from 'svelte/store';
	import { user } from '$lib/stores/userStore';

	let showGetStarted = false;
	$: loaded = writable(0);

	onMount(() => {
		const now = new Date();
		const hours = now.getHours();

		// Show only between 10 PM (22) and 12 AM (0)
		showGetStarted = true; // hours === 22 || hours === 23; TODO: enable this before launch
	});
</script>

<Particles {loaded} />

{#if $loaded === 0}
	<Loader color="dark" hide={true} />
{/if}

<div class="{$loaded === 2 ? 'flex' : 'hidden'} flex-col justify-center items-center h-full">
	<div class="flex flex-col justify-center items-center z-10">
		<div class="h-full flex items-center justify-center">
			<img class="h-16 mr-3" src={logo} alt="Logo" />
			<h1 class="text-white text-5xl pt-1 lg:pt-2 lg:text-7xl lg:pb-2">
				<span class="font-semibold font-sans">BITS</span><span class="font-cursive">megle</span>
			</h1>
		</div>
		<div class="text-gray-400 text-3xl mt-4 mb-6">Powered by CRUx</div>

		{#if showGetStarted}
			<a
				class="inline-block px-6 py-3 bg-gray-200 text-black font-semibold rounded-lg hover:bg-gray-500 transition duration-300"
				href="/{!$user ? 'signup' : 'talk'}"
			>
				Get Started
			</a>
		{:else}
			<div class="text-white text-3xl tagline font-serif m-2">
				Go touch grass. We’ll see you at 10pm.
			</div>
		{/if}
	</div>
</div>

<style>
	.tagline {
		font-family: 'Reenie Beanie', cursive;
		font-weight: 400;
	}
</style>
