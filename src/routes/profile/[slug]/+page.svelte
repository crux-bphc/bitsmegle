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
			class="p-4 max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-lg overflow-hidden shadow-lg"
		>
			<div class="border-b px-4 pb-6">
				<div class="text-center mt-4">
					<img
						class="h-32 w-32 rounded-full border-4 border-gray-200 dark:border-gray-800 mx-auto my-4"
						src={data.picture}
						alt="Profile"
					/>
					<div class="pt-2">
						<h3 class="font-bold text-2xl text-gray-800 dark:text-white mb-1">{data.name}</h3>
					</div>
				</div>
			</div>
			<div class="px-4 py-4">
				<div class="flex gap-2 items-center text-gray-800 dark:text-gray-300 mb-4">
					<i class="text-yellow-500 fas fa-star"></i><!-- Using yellow color for stars -->
					<span><strong>{data.reputation}</strong></span>
				</div>
				<div class="inline-flex text-gray-700 dark:text-gray-300 items-center">
					<i class="h-5 w-5 text-gray-400 dark:text-gray-600 mr-1 mt-2 fas fa-envelope"></i>
					{data.email}
				</div>
				<!-- Removed unnecessary div -->
			</div>
		</div>
		<!-- Card end -->
	</div>
</div>
