<script lang="ts">
	export let data: any;
</script>

<div id="profile" class="flex flex-col items-center justify-center mx-10 text-white">
	<div>
		<!-- Card start -->

		<div class="flex flex-row items-center bg-slate-900 rounded-2xl md:p-4 p-2 mt-20 m-3">
			<td class="mr-12 flex items-center space-x-6 whitespace-nowrap p-4">
				<img src={data.picture} alt="profile" class="md:h-20 h-10 md:w-20 w-10 rounded-full" />
				<div class="text-xl font-normal text-gray-400">
					<div class="text-sm md:text-2xl font-semibold text-white mb-1 md:mb-2">
						{data.name}
					</div>
					<div class="text-xs md:text-xl font-normal text-gray-400">
						{data.email}
					</div>
				</div>
			</td>
			<div
				class="whitespace-nowrap p-4 font-medium text-white bg-slate font-mono text-sm md:text-2xl"
			>
				<i class="text-yellow-500 fas fa-star mr-2"></i>
				<span>{data.reputation}</span>
			</div>
		</div>
		<!-- Card end -->
	</div>
</div>
