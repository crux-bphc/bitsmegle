<script lang="ts">
	import { onMount } from 'svelte';

	import { initializeApp } from 'firebase/app';
	import {
		getFirestore,
		collection,
		doc,
		onSnapshot,
		addDoc,
		setDoc,
		getDoc,
		updateDoc
	} from 'firebase/firestore';

	const firebaseConfig = {
		apiKey: 'AIzaSyDpH24F34f7iaLMX99pjvSWjQ0B-lCZXTQ',
		authDomain: 'bitsmegle.firebaseapp.com',
		projectId: 'bitsmegle',
		storageBucket: 'bitsmegle.appspot.com',
		messagingSenderId: '967984062313',
		appId: '1:967984062313:web:4eba9e15c8304423b5a7f8'
	};

	import { user } from '$lib/stores/userStore';
	import { goto } from '$app/navigation';

	// Initialize Firebase
	const app = initializeApp(firebaseConfig);

	const firestore = getFirestore(app);

	let currentStatus: string = 'Idle, please press connect';
	let localStream: MediaStream;
	let remoteStream: MediaStream;
	let localVideo: HTMLVideoElement;
	let remoteVideo: HTMLVideoElement;
	let callInput: HTMLInputElement;
	let talkingToUser: string;

	let peerConnection: RTCPeerConnection;
	let currentOnlineCount: number = 0;

	onMount(async () => {
		// Assuming you have a function to parse cookies
		const userData = parseCookie(document.cookie).user;
		if (userData) {
			let d = JSON.parse(JSON.parse(userData));
			d.name = d.name
				.split(' ')
				.map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
				.join(' ');
			user.set(d);
		} else {
			return goto('/signup');
		}

		setInterval(
			() =>
				fetch('api/users')
					.then((res) => res.json())
					.then((data) => (currentOnlineCount = data.count)),
			5 * 1000
		);

		const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		localStream = stream;
		await initiateWebRTC();
	});

	function parseCookie(cookieString: string): Record<string, string> {
		const cookies: Record<string, string> = {};
		cookieString.split(';').forEach((cookie) => {
			const [cookieName, cookieValue] = cookie
				.split('=')
				.map((part) => decodeURIComponent(part.trim()));
			cookies[cookieName] = cookieValue || '';
		});
		return cookies;
	}

	async function initiateWebRTC() {
		// Get user media
		remoteStream = new MediaStream();

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
		localStream.getTracks().forEach((track) => {
			peerConnection.addTrack(track, localStream);
		});

		peerConnection.ontrack = (event) => {
			currentStatus = 'Connected to ' + talkingToUser;
			event.streams[0].getTracks().forEach((track) => {
				remoteStream.addTrack(track);
			});

			event.streams[0].onremovetrack = ({ track }) => {
				console.log('Track removed');
			};
		};

		peerConnection.oniceconnectionstatechange = (event) => {
			if (peerConnection.iceConnectionState === 'disconnected') {
				// Peer connection disconnected, you may consider this as no more remote data
				console.log('Peer connection disconnected');
				currentStatus = 'Idle, disconnected, please press connect';
				// remoteStream.getTracks().forEach((track) => track.stop());
			}
		};
		localVideo.srcObject = localStream;
		remoteVideo.srcObject = remoteStream;
	}

	async function handleConnect() {
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
			handleCall();
			res = await fetch('/api/calls', {
				method: 'POST',
				body: JSON.stringify({ id: callInput.value, user: $user.name }),
				headers: {
					'Content-Type': 'application/json'
				}
			});
			currentStatus = 'Waiting to connect with someone...';
		} else {
			callInput.value = data.id;
			talkingToUser = data.user;
			console.log('Handling answer?');
			handleAnswer();
		}
	}

	async function handleCall() {
		// Reference Firestore collections for signaling
		const callDocRef = doc(collection(firestore, 'calls'));
		const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
		const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

		callInput.value = callDocRef.id;

		// Get candidates for caller, save to db
		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				await addDoc(offerCandidatesRef, event.candidate.toJSON());
			}
		};

		// Create offer
		const offerDescription = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offerDescription);

		const offer = {
			sdp: offerDescription.sdp,
			type: offerDescription.type
		};

		await setDoc(callDocRef, { offer });

		// Listen for remote answer
		onSnapshot(callDocRef, (snapshot) => {
			const data = snapshot.data();
			if (!peerConnection.currentRemoteDescription && data?.answer) {
				const answerDescription = new RTCSessionDescription(data.answer);
				peerConnection.setRemoteDescription(answerDescription);
			}
		});

		// When answered, add candidate to peer connection
		onSnapshot(answerCandidatesRef, (snapshot) => {
			snapshot.docChanges().forEach((change) => {
				if (change.type === 'added') {
					const candidate = new RTCIceCandidate(change.doc.data());
					peerConnection.addIceCandidate(candidate);
				}
			});
		});
	}
	async function handleAnswer() {
		const callId = callInput.value;
		console.log(callId);
		const callDocRef = doc(firestore, 'calls', callId);
		const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
		const offerCandidatesRef = collection(callDocRef, 'offerCandidates');

		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				await addDoc(answerCandidatesRef, event.candidate.toJSON());
			}
		};

		const callDocSnapshot = await getDoc(callDocRef);
		const callData = callDocSnapshot.data();

		if (typeof callData == 'undefined') {
			// Person didn't give permissions for camera but somehow connected?
		}
		const offerDescription = callData.offer;
		await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

		const answerDescription = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answerDescription);

		const answer = {
			type: answerDescription.type,
			sdp: answerDescription.sdp
		};

		await updateDoc(callDocRef, { answer });

		onSnapshot(offerCandidatesRef, (snapshot) => {
			snapshot.docChanges().forEach((change) => {
				if (change.type === 'added') {
					const data = change.doc.data();
					peerConnection.addIceCandidate(new RTCIceCandidate(data));
				}
			});
		});
	}
	async function endWebRTC() {
		// Close WebRTC connection and WebSocket connection
		await peerConnection.close();

		// Stop local media stream
		// localStream.getTracks().forEach((track) => track.stop());
	}
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
	<h1 class="text-5xl font-bold mb-2">BITSmegle</h1>

	{#if $user}
		<div class="mb-1">
			Hello, <span class="text-blue-300">{$user.name} </span>👋
		</div>
		{#if currentOnlineCount > 1}
			<span class="text-gray-300 mb-3 text-sm"
				>There are currently {currentOnlineCount} people online!</span
			>
		{:else if currentOnlineCount == 1}
			<span class="text-gray-300 mb-3 text-sm">Only you are online right now, please wait :(</span>
		{/if}
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-screen-lg">
		<div class="relative">
			<video
				class="object-cover w-full h-full aspect-w-16 aspect-h-9 max-w-full"
				bind:this={localVideo}
				autoplay
				muted
			>
				<!-- Dummy track for accessibility -->
				<track kind="captions" />
			</video>
		</div>

		<div class="relative">
			<video
				class="object-cover w-full h-full aspect-w-16 aspect-h-9 max-w-full"
				bind:this={remoteVideo}
				autoplay
			>
				<!-- Dummy track for accessibility -->
				<track kind="captions" />
			</video>
		</div>
	</div>

	<div class="mt-6 flex flex-col items-center space-y-4">
		<div>
			Status:
			<span>{currentStatus}</span>
		</div>
		<input
			class="w-full px-4 py-2 bg-gray-800 text-white rounded-lg"
			bind:this={callInput}
			placeholder="Call ID"
			disabled
		/>

		<div class="flex space-x-4">
			<button
				class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300"
				on:click={handleConnect}>{currentStatus[0] == 'I' ? 'Connect' : 'Skip'}</button
			>

			<button
				class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300"
				on:click={endWebRTC}>End Chat</button
			>
		</div>
	</div>
</div>

<style>
	video {
		transform: rotateY(180deg);
		-webkit-transform: rotateY(180deg); /* Safari and Chrome */
		-moz-transform: rotateY(180deg); /* Firefox */
	}
</style>
