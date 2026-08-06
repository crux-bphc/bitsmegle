<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { PUBLIC_BACKEND_URI } from '$env/static/public';

	import { user, remoteUser } from '$lib/stores/userStore';
	import { socket } from '$lib/stores/socketStore';

	import Video from '../../components/Video.svelte';
	import Rate from '../../components/Rate.svelte';
	import Modal from '../../components/Modal.svelte';

	import { localStream, remoteStream } from '$lib/stores/streamStore';
	import MobileChat from '../../components/MobileChat.svelte';

	import { currentStatus } from '$lib/stores/statusStore';

	let currentCallId: string = '';
	// Guards leaveCall() so every exit path (End/Skip, in-app navigation, tab
	// close, component teardown) can call it without racing or double-firing
	// end-call/close(). Reset whenever a fresh peer connection is set up.
	let hasLeftCall = false;
	let drawer = writable(false);
	let hasPing = false;
	let pingCount = 0;

	$: if ($drawer) {
		hasPing = false;
		pingCount = 0;
	}

	function handleNewMessage() {
		// only ping if the drawer is closed
		if (!$drawer) {
			hasPing = true;
			pingCount += 1;
		}
	}

	let peerConnection: RTCPeerConnection;
	import { goto, beforeNavigate } from '$app/navigation';
	import { writable } from 'svelte/store';

	let running = true;
	let rating = writable(false);

	const start = async () => {
		// Start button wont work

		running = true;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
			localStream.set(stream);
			// console.log(stream);
			await initiateWebRTC();
		} catch (e: any) {
			running = false;
			if (e.name === 'NotAllowedError') {
				$currentStatus = 'Permission Denied';
			}
			throw e;
		}
	};

	// Listen for remote answer
	const handleAnswerMade = async (data) => {
		if (data.answer) {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
			$currentStatus = 'Found someone';
		}
	};

	// When answered, add candidate to peer connection
	const handleAddIceCandidate = (data) => {
		if (data.candidate) {
			peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
		}
	};

	const handleCallData = async (data) => {
		data = JSON.parse(data);
		if (typeof data == 'undefined') {
			// Person didn't give permissions for camera but somehow connected?
		}
		const offerDescription = new RTCSessionDescription(data.offer); // ignore this
		await peerConnection.setRemoteDescription(offerDescription);
		const answerDescription = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answerDescription);

		const answer = {
			type: answerDescription.type,
			sdp: answerDescription.sdp
		};

		$socket?.emit('make-answer', { callId: data.callId, answer });
	};

	const handleCallFound = async (data) => {
		currentCallId = data;
		console.log('Handling answer...');
		await handleAnswer();
	};

	const handleCallNotFound = async () => {
		console.log('Creating call...');
		await handleCall();
		$currentStatus = 'Finding someone...';
	};

	const handleRemoteUser = (data) => {
		console.log('Remote user:', data);
		remoteUser.set(data);
	};

	// The peer skipped/ended the call; tear down immediately instead of waiting
	// for our own ICE connection to notice they're gone, and requeue just like
	// clicking Skip does for the person who initiated it.
	const handleCallEnded = async () => {
		if ($currentStatus[0] === 'C' || $currentStatus[0] === 'F') {
			$currentStatus = 'Idle';
			await leaveCall(true);
			await initiateWebRTC();
			$currentStatus = 'Finding somebody...';
			$socket?.emit('looking-for-somebody');
		}
	};

	// The tab is closing, being refreshed, or navigating to a page outside the
	// SPA (so beforeNavigate/onDestroy won't fire in time). Fire-and-forget the
	// same notification the other exit paths send; the server's socket
	// `disconnect` handler is the fallback if this doesn't make it out in time.
	const handlePageHide = () => {
		leaveCall(false);
	};

	// Any in-app navigation away from /talk (the logo, leaderboard/profile
	// links, browser back/forward). Runs before the component is torn down, so
	// there's no page left to show a rating prompt on.
	beforeNavigate(() => {
		leaveCall(false);
	});

	onMount(async () => {
		const userData = parseCookie(document.cookie).user;
		if (userData) {
			fetch(`${PUBLIC_BACKEND_URI}/api/users`, {
				method: 'POST',
				body: userData,
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then(async (res) => {
					if (!res.ok) return goto('/signup');

					const data = await res.json();
					user.set(data.data);
				})
				.catch((err) => {
					console.error(err);
					goto('/signup');
				});
		} else {
			return goto('/signup');
		}

		$socket?.on('answer-made', handleAnswerMade);
		$socket?.on('add-ice-candidate', handleAddIceCandidate);
		$socket?.on('call-data', handleCallData);
		$socket?.on('call-found', handleCallFound);
		$socket?.on('call-not-found', handleCallNotFound);
		$socket?.on('remote-user', handleRemoteUser);
		$socket?.on('call-ended', handleCallEnded);

		window.addEventListener('pagehide', handlePageHide);
	});

	// Safety net for any teardown beforeNavigate doesn't cover (e.g. HMR,
	// non-navigation unmounts). leaveCall() is idempotent, so this is a no-op
	// if beforeNavigate already ran.
	onDestroy(() => {
		leaveCall(false);

		$socket?.off('answer-made', handleAnswerMade);
		$socket?.off('add-ice-candidate', handleAddIceCandidate);
		$socket?.off('call-data', handleCallData);
		$socket?.off('call-found', handleCallFound);
		$socket?.off('call-not-found', handleCallNotFound);
		$socket?.off('remote-user', handleRemoteUser);
		$socket?.off('call-ended', handleCallEnded);

		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', handlePageHide);
		}
	});

	const handleModalClose = async () => {
		await start();
	};

	const parseCookie = (cookieString: string): Record<string, string> => {
		const cookies: Record<string, string> = {};
		cookieString.split(';').forEach((cookie) => {
			const [cookieName, cookieValue] = cookie
				.split('=')
				.map((part) => decodeURIComponent(part.trim()));
			cookies[cookieName] = cookieValue || '';
		});
		return cookies;
	};

	const initiateWebRTC = async () => {
		// A fresh connection is starting, so the next leaveCall() (whenever it
		// happens) should actually run instead of being skipped as a duplicate.
		hasLeftCall = false;

		// Set up WebRTC peer connection
		const servers = {
			iceServers: [
				{
					urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
				}
			],
			iceCandidatePoolSize: 10
		};
		peerConnection = new RTCPeerConnection(servers);

		// Add local tracks to the peer connection

		$localStream?.getTracks().forEach((track) => {
			peerConnection.addTrack(track, $localStream ? $localStream : new MediaStream());
		});

		peerConnection.ontrack = async (event) => {
			event.streams[0].getTracks().forEach((track) => {
				if (track.readyState === 'live') {
					// Set remote stream to a new stream
					if (!$remoteStream) {
						let m = new MediaStream();
						m.addTrack(track);
						remoteStream.set(m);
					} else {
						$remoteStream?.addTrack(track);
					}
					// console.log('Got remote track:', track);
				}
			});

			event.streams[0].onremovetrack = ({ track }) => {
				// console.log('Track removed');
			};
		};

		peerConnection.addEventListener('connectionstatechange', (event) => {
			if (peerConnection.connectionState === 'connected') {
				// Peers connected
				console.log('Peers connected');
				$socket?.emit('who-is-remote', { callId: currentCallId });

				$currentStatus = 'Connected';
			}
		});

		peerConnection.oniceconnectionstatechange = async (event) => {
			if (peerConnection.iceConnectionState === 'disconnected') {
				// TODO: For some reason this fires quite late even after user dissconnects
				// Peer connection disconnected, you may consider this as no more remote data
				console.log('Peer connection disconnected');
				if ($currentStatus[0] === 'C') {
					$currentStatus = 'Idle, disconnected';
					await leaveCall(true);
					await initiateWebRTC();
				} else if ($currentStatus[0] === 'F') {
					$currentStatus = "Idle, couldn't connect";
					await leaveCall(true);
					await initiateWebRTC();
				}
				// remoteStream.getTracks().forEach((track) => track.stop());
			}
		};
	};

	const handleConnect = async () => {
		if ($currentStatus[0] === 'C') {
			$currentStatus = 'Idle';
			await leaveCall(true);
			console.log('Ended WebRTC');
			await initiateWebRTC();
		}
		console.log('Looking for somebody...');
		$currentStatus = 'Finding somebody...';
		// No identity payload: the backend uses the one it derived at handshake time.
		$socket?.emit('looking-for-somebody');
	};

	const handleCall = async () => {
		const callId = crypto.randomUUID();

		currentCallId = callId;
		// Create offer

		const offerDescription = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offerDescription);

		const offer = {
			sdp: offerDescription.sdp,
			type: offerDescription.type
		};

		$socket?.emit('make-offer', { callId, offer });

		// Get candidates for caller, save to db
		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				$socket?.emit('offerCandidate', { callId, candidate: event.candidate.toJSON() });
			}
		};
	};

	const handleAnswer = async () => {
		const callId = currentCallId;
		console.log(callId);

		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				$socket?.emit('answerCandidate', { callId, candidate: event.candidate.toJSON() });
			}
		};

		$socket?.emit('call-accepted', { callId });
	};

	const handleRating = () => {
		$rating = false;
	};

	// The single teardown path for every way a call can end: the End/Skip
	// buttons, the peer ending it, our own ICE connection dying, in-app
	// navigation away from /talk, component destroy, or the tab closing. Guarded
	// by hasLeftCall so it's safe to call from more than one of those triggers
	// without double-emitting end-call or double-closing the peer connection.
	const leaveCall = async (rate: boolean = false) => {
		if (hasLeftCall) return;
		hasLeftCall = true;

		if (currentCallId) {
			$socket?.emit('end-call', { callId: currentCallId });
			currentCallId = '';
		}

		peerConnection?.close();

		if (rate && $remoteUser) {
			// ask for rating — only reachable from paths where the page is still
			// up to show it (End/Skip, peer-ended, ICE-disconnected)
			$rating = true;
			await new Promise<void>((resolve) => {
				const unsubscribe = rating.subscribe((value) => {
					console.log('rating done', !value);
					if (!value) {
						unsubscribe();
						resolve();
					}
				});
			});
			console.log('rating done really');
		}

		remoteStream.set(null);
		remoteUser.set(null);
	};

	const closeEverything = async () => {
		$localStream?.getTracks().forEach((track) => track.stop());
		$currentStatus = 'Stopped, please refresh to start again';
		running = false;
		await leaveCall(false);
	};
</script>

<Modal on:close={handleModalClose} />
{#if $user}
	<section
		class="h-[80%] land:h-[75%] land:flex-row lg:h-[75%] flex flex-col lg:flex-row items-center justify-start gap-5 py-5"
	>
		<Video who="you" />
		{#if $rating}
			<Rate on:interaction={handleRating} />
		{:else}
			<Video who="them" />
		{/if}
	</section>

	<!-- <section class="hidden h-[13%] lg:flex sm:flex-col lg:flex-row items-center justify-evenly">
		<div class="relative h-[90%] w-[48%] rounded-3xl flex items-start">
			<div class="w-full p-5 flex justify-center space-x-5 items-center">
				<div class="text-white bg-gray-800 rounded-lg px-4 py-2">
					Status: {$currentStatus}
				</div>
				{#if running}
					<button
						class="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md text-base disabled:opacity-50 {$rating
							? 'hidden'
							: ''}"
						disabled={$currentStatus[0] == 'F'}
						on:click={handleConnect}>{$currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
					>
					<button
						class="bg-rose-600 hover:bg-rose-700 text-white py-2 px-4 rounded-md text-base {$rating
							? 'hidden'
							: ''}"
						on:click={running ? closeEverything : start}>{running ? 'End' : 'Start'}</button
					>
				{/if}
			</div>
		</div>

		<Chat />
	</section> -->

	<MobileChat {drawer} on:newMessage={handleNewMessage} />
	<section
		class="w-full px-4 flex flex-col md:flex-row md:justify-center md:items-center text-base"
	>
		<!-- STATUS BOX -->
		<div
			class="w-full md:w-auto bg-slate-900 text-white rounded-md px-4 py-2 mr-2 text-center md:text-left"
		>
			<span class="font-semibold">Status:</span>
			<span class="ml-1">{$currentStatus}</span>
		</div>

		<!-- BUTTONS ROW -->
		{#if running && !$rating}
			<div class="flex flex-wrap justify-center md:justify-start items-center gap-2 mt-2 md:mt-0">
				<button
					class="bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
					on:click={handleConnect}
					disabled={$currentStatus[0] == 'F' && running}
				>
					{$currentStatus[0] == 'I' ? 'Connect' : 'Skip'}
				</button>

				<button
					class="bg-rose-600 text-white px-4 py-2 rounded-lg"
					on:click={running ? closeEverything : start}
				>
					{running ? 'End' : 'Start'}
				</button>
				<button
					class="relative bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center justify-center h-full"
					on:click={() => ($drawer = !$drawer)}
				>
					<i class="fas fa-comment text-base"></i>
					{#if hasPing}
						<!-- little red dot, absolutely positioned inside its parent button -->
						<span
							class="absolute top-1 right-1 h-6 w-6 bg-red-500 rounded-full
             translate-x-1/2 -translate-y-1/2">{pingCount}</span
						>
					{/if}
				</button>
			</div>
		{/if}
	</section>
{/if}
