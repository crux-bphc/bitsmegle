<script lang="ts">
	export let data: any;
</script>

<div
	id="profile"
	class="flex flex-col items-center justify-center mx-10 text-gray-800 dark:text-white"
>
	<div>
		<!-- Card start -->
		<div
			class="relative flex flex-col text-gray-700 bg-slate-700 shadow-md bg-clip-border rounded-xl w-96"
		>
			<div
				class="relative mx-4 mt-4 overflow-hidden border border-purple-400 bg-white bg-clip-border rounded-xl h-80"
			>
				<img src={data.picture} alt="" />
			</div>
			<div class="p-6 text-center"> 
				<h4
					class="block mb-2 font-sans text-2xl font-semibold leading-snug tracking-normal text-white"
				>
					{data.name}
				</h4>
				<p class="block font-sans font-medium leading-relaxed text-gray-400">{data.email}</p>
			</div>
			<div class="flex justify-center items-center p-6 pb-6 gap-2">
				<img class="w-4 h-4" src="https://i.imgur.com/1XYOJHg.png" alt="" />
				<span class="text-white text-2xl">{data.reputation}</span>
			</div>
		</div>
		
		<!-- Card end -->
	</div>
</div>
