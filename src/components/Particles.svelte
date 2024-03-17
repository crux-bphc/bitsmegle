<script>
	import { particlesInit } from '@tsparticles/svelte';
	import { SvelteComponent, onMount } from 'svelte';
	//import { loadFull } from "tsparticles"; // if you are going to use `loadFull`, install the "tsparticles" package too.
	import { loadSlim } from '@tsparticles/slim'; // if you are going to use `loadSlim`, install the "@tsparticles/slim" package too.

	let ParticlesComponent;

	onMount(async () => {
		const module = await import('@tsparticles/svelte');

		ParticlesComponent = module.default;
	});

	let particlesConfig = {
		interactivity: {
			events: {
				onHover: {
					enable: true,
					mode: 'repulse'
				},
				onClick: {
					enable: true,
					mode: 'repulse'
				}
			},
			modes: {
				repulse: {
					distance: 100
				}
			}
		},
		particles: {
			color: {
				value: '#aaa'
			},
			links: {
				enable: true,
				color: '#eee',
				opacity: 0.5
			},
			move: {
				enable: true
			},
			number: {
				value: 50
			},
			opacity: {
				value: 0.5
			}
		}
	};

	let onParticlesLoaded = (event) => {
		const particlesContainer = event.detail.particles;

		// you can use particlesContainer to call all the Container class
		// (from the core library) methods like play, pause, refresh, start, stop
	};

	void particlesInit(async (engine) => {
		// call this once per app
		// you can use main to customize the tsParticles instance adding presets or custom shapes
		// this loads the tsparticles package bundle, it's the easiest method for getting everything ready
		// starting from v2 you can add only the features you need reducing the bundle size
		//await loadFull(main);
		await loadSlim(engine);
	});
</script>

<svelte:component
	this={ParticlesComponent}
	id="tsparticles"
	class=""
	style=""
	options={particlesConfig}
	on:particlesLoaded={onParticlesLoaded}
/>
