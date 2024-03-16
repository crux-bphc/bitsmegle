<script>
	import { onMount, onDestroy } from 'svelte';
	import logo from '$lib/assets/logo.png';

	let countdown = '';
	let timerInterval;

	onMount(() => {
		// Calculate the time remaining until 7 days from now
		const deadline = new Date();
		deadline.setDate(20);

		// Function to update the countdown timer
		function updateCountdown() {
			const now = new Date();
			const timeLeft = deadline - now;

			const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
			const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
			const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

			countdown = `${days}d ${hours}h ${minutes}m ${seconds}s`;
		}

		// Update the countdown every second
		timerInterval = setInterval(updateCountdown, 1000);

		// Ensure timer is cleared when component is destroyed
		onDestroy(() => {
			clearInterval(timerInterval);
		});
	});
</script>

<div class="flex flex-col justify-center items-center h-full">
	<div class="flex flex-col justify-center items-center">
		<div class="h-full flex items-center justify-center">
			<img class="h-14 mr-3" src={logo} alt="Logo" />
			<h1 class="text-white text-4xl pt-1 lg:pt-2 lg:text-6xl lg:pb-2">
				<span class="font-semibold font-sans">BITS</span><span class="font-cursive">megle</span>
			</h1>
		</div>
		<div class="text-gray-400 text-md font-serif mt-4 mb-6">Kabhi online intro diya hai kya?</div>
		<div class="text-white text-xl font-serif m-2">Launching soon...</div>
		<div class="text-white text-xl font-serif m-2">{countdown}</div>
	</div>
</div>
