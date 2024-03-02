<script lang="ts">
	import '../app.css';
	import Nav from '../components/Nav.svelte';
	import Video from '../components/Video.svelte';
</script>

<Nav />
<section class="h-[65%] bg-slate-700 flex sm:flex-col md:flex-row items-center justify-evenly">
	<Video />
	<Video />
</section>
<slot />
