<script lang="ts">
	import { onMount } from 'svelte';

	import { user, remoteUser } from '$lib/stores/userStore';
	import { socket } from '$lib/stores/socketStore';

	import Video from '../../components/Video.svelte';
	import Chat from '../../components/Chat.svelte';
	import Rate from '../../components/Rate.svelte';
	import Modal from '../../components/Modal.svelte';

	import { localStream, remoteStream } from '$lib/stores/streamStore';
	import MobileChat from '../../components/MobileChat.svelte';

	import { currentStatus } from '$lib/stores/statusStore';
	$currentStatus = 'Idle';

	let currentCallId: string = '';
	let drawer = writable(true);

	let peerConnection: RTCPeerConnection;
	import { goto } from '$app/navigation';
	import { writable } from 'svelte/store';
	import { draw } from 'svelte/transition';

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
		}
	};

	onMount(async () => {
		const userData = parseCookie(document.cookie).user;
		if (userData) {
			fetch('https://server.bitsmegle.live/api/users', {
				method: 'POST',
				body: userData,
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then((res) => res.json())
				.then((data) => {
					user.set(data.data);
					if (data.cookie) document.cookie = data.cookie;
				});
		} else {
			return goto('/signup');
		}

		// Listen for remote answer
		$socket?.on('answer-made', async (data) => {
			if (data.answer) {
				await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
				$currentStatus = 'Found someone';
			}
		});

		// When answered, add candidate to peer connection
		$socket?.on('add-ice-candidate', (data) => {
			// console.log(data);
			if (data.candidate) {
				peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
				// console.log('Added ice candidate');
			}
		});

		$socket?.on('call-data', async (data) => {
			data = JSON.parse(data);
			if (typeof data == 'undefined') {
				// Person didn't give permissions for camera but somehow connected?
			}
			// console.log(data);
			const offerDescription = new RTCSessionDescription(data.offer); // ignore this
			await peerConnection.setRemoteDescription(offerDescription);
			const answerDescription = await peerConnection.createAnswer();
			await peerConnection.setLocalDescription(answerDescription);

			const answer = {
				type: answerDescription.type,
				sdp: answerDescription.sdp
			};

			$socket?.emit('make-answer', { callId: data.callId, answer });
		});

		$socket?.on('call-found', async (data) => {
			currentCallId = data;
			console.log('Handling answer...');
			await handleAnswer();
		});

		$socket?.on('call-not-found', async () => {
			console.log('Creating call...');
			await handleCall();
			$currentStatus = 'Finding someone...';
		});

		$socket?.on('remote-user', (data) => {
			console.log('Remote user:', data);
			remoteUser.set(data);
		});
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
					await endWebRTC();
					await initiateWebRTC();
				} else if ($currentStatus[0] === 'F') {
					$currentStatus = "Idle, couldn't connect";
					await endWebRTC();
					await initiateWebRTC();
				}
				// remoteStream.getTracks().forEach((track) => track.stop());
			}
		};
	};

	const handleConnect = async () => {
		if ($currentStatus[0] === 'C') {
			$currentStatus = 'Idle';
			await endWebRTC();
			console.log('Ended WebRTC');
			await initiateWebRTC();
		}
		console.log('Looking for somebody...');
		$currentStatus = 'Finding somebody...';
		$socket?.emit('looking-for-somebody', $user);

		// let res = await fetch('/api/calls', {
		// 	method: 'GET'
		// });
		// let data = await res.json();
		// console.log(data);
		// if (!data.id) {
		// 	await handleCall();
		// 	res = await fetch('/api/calls', {
		// 		method: 'POST',
		// 		credentials: 'same-origin',
		// 		body: JSON.stringify({ id: currentCallId, user: $user }),
		// 		headers: {
		// 			'Content-Type': 'application/json'
		// 		}
		// 	});
		// 	// TODO: perm fix, rn temp fix
		// 	data = await res.json();
		// 	if (data.id != currentCallId) {
		// 		// got connected to someone else even though there was no one before
		// 		currentCallId = data.id;
		// 		remoteUser.set(data.user);
		// 		console.log('Handling answer?');
		// 		await handleAnswer();
		// 	} else {
		// 		$currentStatus = 'Finding someone...';
		// 	}
		// } else {
		// 	res = await fetch('/api/calls', {
		// 		method: 'POST',
		// 		body: JSON.stringify({ id: data.id, user: $user }),
		// 		headers: {
		// 			'Content-Type': 'application/json'
		// 		}
		// 	});
		// 	data = await res.json();
		// 	currentCallId = data.id;
		// 	remoteUser.set(data.user);
		// 	console.log('Handling answer?');
		// 	await handleAnswer();
		// }
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

		$socket?.emit('make-offer', { callId, offer, user: $user });

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

	const endWebRTC = async (rate: boolean = true) => {
		await peerConnection.close();

		if (rate && $remoteUser) {
			// ask for rating
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

		// Close WebRTC connection and WebSocket connection

		remoteStream.set(null);

		remoteUser.set(null);

		// RTCDataChannel.close()

		// Stop local media stream
		// localStream.getTracks().forEach((track) => track.stop());
	};

	const closeEverything = async () => {
		$localStream?.getTracks().forEach((track) => track.stop());
		$currentStatus = 'Stopped, please refresh to start again';
		running = false;
		await endWebRTC(false);
	};
</script>

<Modal on:close={handleModalClose} />
{#if $user}
	<section
		class="h-[85%] land:h-[75%] land:flex-row lg:h-[75%] flex flex-col lg:flex-row items-center justify-evenly"
	>
		<Video who="you" />
		{#if $rating}
			<Rate on:interaction={handleRating} />
		{:else}
			<Video who="them" />
		{/if}
	</section>

	<section class="hidden h-[13%] lg:flex sm:flex-col lg:flex-row items-center justify-evenly">
		<div class="relative h-[90%] w-[48%] rounded-3xl flex items-start">
			<div class="w-full p-5 flex justify-center space-x-5 items-center">
				<div class="text-white bg-gray-800 rounded-lg px-4 py-2">
					Status: {$currentStatus}
				</div>
				{#if running}
					<button
						class="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md text-md disabled:opacity-50 {$rating
							? 'hidden'
							: ''}"
						disabled={$currentStatus[0] == 'F'}
						on:click={handleConnect}>{$currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
					>
					<button
						class="bg-rose-600 hover:bg-rose-700 text-white py-2 px-4 rounded-md text-md {$rating
							? 'hidden'
							: ''}"
						on:click={running ? closeEverything : start}>{running ? 'End' : 'Start'}</button
					>
				{/if}
			</div>
		</div>

		<Chat />
	</section>

	<MobileChat {drawer} />
	<section class="w-full h-[8%] flex lg:hidden justify-center">
		<div class="text-white text-xs bg-gray-800 rounded-lg px-4 py-4 my-auto">
			Status:
			<span>{$currentStatus}</span>
		</div>

		{#if running}
			<button
				class="bg-indigo-600 text-white p-2 rounded-lg text-md my-auto ml-4 disabled:opacity-50 {$rating
					? 'hidden'
					: ''}"
				on:click={handleConnect}
				disabled={$currentStatus[0] == 'F' && running}
				>{$currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
			>
			<button
				class="bg-rose-600 text-white py-2 px-4 rounded-md text-md my-auto ml-4 {$rating
					? 'hidden'
					: ''}"
				on:click={running ? closeEverything : start}>{running ? 'End' : 'Start'}</button
			>
			<button
				class="bg-emerald-600 text-white py-2 px-4 rounded-md text-md my-auto ml-4 {$rating
					? 'hidden'
					: ''}"
				on:click={() => ($drawer = !$drawer)}
			>
				<i class="fas fa-comment text-sm"></i>
			</button>
		{/if}
	</section>
{/if}
