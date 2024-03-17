<script>
	import logo from '../../lib/assets/logo.png';
</script>

<div class="flex flex-col items-center justify-center h-[80%] text-white">
	<div class="bg-slate-900 p-6 rounded-xl text-white text-center">
		<div class="flex flex-row items-center justify-center mb-6">
			<img class="h-12 mr-3" src={logo} alt="Logo" />
			<h1 class="text-white text-2xl pt-1 lg:pt-2 lg:text-5xl lg:pb-2">
				<span class="font-semibold font-sans">BITS</span><span class="font-cursive">megle</span>
			</h1>
		</div>
		<div class="flex flex-col items-center space-y-4">
			<form class="auth-form" method="post" action="?/OAuth2">
				<button
					type="submit"
					class="px-6 py-2 bg-black text-white rounded-lg hover:bg-slate-950 transition duration-300"
				>
					<img
						src="https://www.freepnglogos.com/uploads/google-logo-png/google-logo-vector-graphic-pixabay-15.png"
						alt="Google Logo"
						class="h-6 w-6 inline-block"
					/>
					Sign in with Google
				</button>
			</form>

			<p class="text-xs text-gray-400 mt-4">
				By signing up on this platform,
				<br />
				you agree to our
				<a href="/terms" class="text-blue-600">Terms and Conditions </a>and
				<a href="/privacy" class="text-blue-600">Privacy Policy</a>.
			</p>
		</div>
	</div>
</div>
