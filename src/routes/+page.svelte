<script lang="ts">
	import { onMount } from 'svelte';

	import { user, remoteUser } from '$lib/stores/userStore';
	import { socket } from '$lib/stores/socketStore';

	import Video from '../components/Video.svelte';
	import Chat from '../components/Chat.svelte';

	import { localStream, remoteStream } from '$lib/stores/streamStore';
	import MobileChat from '../components/MobileChat.svelte';

	let currentStatus: string = 'Idle';

	let callInput: HTMLInputElement;

	let peerConnection: RTCPeerConnection;
	import { goto } from '$app/navigation';

	onMount(async () => {
		const userData = parseCookie(document.cookie).user;
		if (userData) {
			fetch('/api/users', {
				method: 'POST',
				body: userData,
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then((res) => res.json())
				.then((data) => user.set(data));
		} else {
			return goto('/signup');
		}
		const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		localStream.set(stream);
		await initiateWebRTC();

		// Listen for remote answer
		$socket?.on('answer-made', async (data) => {
			if (data.answer) {
				await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
			}
		});

		// When answered, add candidate to peer connection
		$socket?.on('add-ice-candidate', (data) => {
			console.log(data);
			if (data.candidate) {
				peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
				console.log('Added ice candidate');
			}
		});

		$socket?.on('call-data', async (data) => {
			data = JSON.parse(data);
			if (typeof data == 'undefined') {
				// Person didn't give permissions for camera but somehow connected?
			}
			console.log(data);
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
	});

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
		// Set remote stream to a new stream
		remoteStream.set(new MediaStream());

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
				$remoteStream?.addTrack(track);
			});

			event.streams[0].onremovetrack = ({ track }) => {
				console.log('Track removed');
			};

			if (!$remoteUser) {
				let res = await fetch(`/api/calls?callId=${callInput.value}`, {
					method: 'GET'
				});
				let data = await res.json();
				remoteUser.set(data.receiver);
			}
			currentStatus = 'Connected';
		};

		peerConnection.oniceconnectionstatechange = async (event) => {
			if (peerConnection.iceConnectionState === 'disconnected') {
				// TODO: For some reason this fires quite late even after user dissconnects
				// Peer connection disconnected, you may consider this as no more remote data
				console.log('Peer connection disconnected');
				currentStatus = 'Idle, disconnected';
				await endWebRTC();
				await initiateWebRTC();
				// remoteStream.getTracks().forEach((track) => track.stop());
			}
		};
	};

	const handleConnect = async () => {
		if (currentStatus[0] === 'C') {
			await endWebRTC();
			await initiateWebRTC();
		}

		let res = await fetch('/api/calls', {
			method: 'GET'
		});
		let data = await res.json();
		console.log(data);
		if (!data.id) {
			await handleCall();
			res = await fetch('/api/calls', {
				method: 'POST',
				credentials: 'same-origin',
				body: JSON.stringify({ id: callInput.value, user: $user }),
				headers: {
					'Content-Type': 'application/json'
				}
			});
			// TODO: perm fix, rn temp fix
			data = await res.json();
			if (data.id != callInput.value) {
				// got connected to someone else even though there was no one before
				callInput.value = data.id;
				remoteUser.set(data.user);
				console.log('Handling answer?');
				await handleAnswer();
			} else {
				currentStatus = 'Finding someone...';
			}
		} else {
			res = await fetch('/api/calls', {
				method: 'POST',
				body: JSON.stringify({ id: data.id, user: $user }),
				headers: {
					'Content-Type': 'application/json'
				}
			});
			data = await res.json();
			callInput.value = data.id;
			remoteUser.set(data.user);
			console.log('Handling answer?');
			await handleAnswer();
		}
	};

	const handleCall = async () => {
		const callId = crypto.randomUUID();

		callInput.value = callId;
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
		const callId = callInput.value;
		console.log(callId);

		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				$socket?.emit('answerCandidate', { callId, candidate: event.candidate.toJSON() });
			}
		};

		$socket?.emit('call-accepted', { callId });
	};

	const endWebRTC = async () => {
		// Close WebRTC connection and WebSocket connection
		remoteUser.set(null);
		remoteStream.set(null);
		await peerConnection.close();
		// RTCDataChannel.close()

		// Stop local media stream
		// localStream.getTracks().forEach((track) => track.stop());
	};
</script>

{#if $user}
	<section class="h-[85%] lg:h-[75%] flex flex-col lg:flex-row items-center justify-evenly">
		<Video who="you" />
		<Video who="them" />
	</section>

	<section class="hidden h-[13%] md:flex sm:flex-col md:flex-row items-center justify-evenly">
		<div class="relative h-[90%] w-[48%] rounded-3xl flex items-start">
			<div class="w-full p-5 flex justify-center space-x-5 items-center">
				<div class="text-white bg-gray-800 rounded-lg px-4 py-2">
					Status: {currentStatus}
				</div>
				<input
					class="px-4 py-2 bg-gray-800 text-white rounded-lg"
					bind:this={callInput}
					placeholder="Call ID"
					disabled
				/>
				<button
					class="bg-indigo-500 text-white py-2 px-4 rounded-md text-md"
					disabled={currentStatus[0] == 'F'}
					on:click={handleConnect}>{currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
				>
				<button class="bg-rose-500 text-white py-2 px-4 rounded-md text-md" on:click={endWebRTC}
					>End</button
				>
			</div>
		</div>

		<!-- <Chat /> -->
	</section>

	{#if false}
		<MobileChat />
	{:else}
		<section class="w-full h-[8%] flex md:hidden justify-center">
			<div class="text-white bg-gray-800 rounded-lg px-4 py-2 my-auto">
				Status:
				<span>{currentStatus}</span>
			</div>

			<button
				class="bg-indigo-500 text-white p-2 rounded-lg text-md my-auto ml-4"
				on:click={handleConnect}
				disabled={currentStatus[0] == 'F'}>{currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
			>
		</section>
	{/if}
{/if}
