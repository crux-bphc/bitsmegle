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

	// Initialize Firebase
	const app = initializeApp(firebaseConfig);

	const firestore = getFirestore(app);

	let localStream: MediaStream;
	let remoteStream: MediaStream;
	let localVideo: HTMLVideoElement;
	let remoteVideo: HTMLVideoElement;
	let callInput: HTMLInputElement;

	let peerConnection: RTCPeerConnection;

	onMount(() => {
		initiateWebRTC();
	});

	function initiateWebRTC() {
		// Get user media
		navigator.mediaDevices
			.getUserMedia({ video: true, audio: true })
			.then((stream) => {
				localStream = stream;
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
					event.streams[0].getTracks().forEach((track) => {
						remoteStream.addTrack(track);
					});
				};
				localVideo.srcObject = localStream;
				remoteVideo.srcObject = remoteStream;
			})
			.catch((err) => {
				console.error('Error accessing media devices:', err);
			});
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
	function endWebRTC() {
		// Close WebRTC connection and WebSocket connection
		peerConnection.close();

		// Stop local media stream
		localStream.getTracks().forEach((track) => track.stop());
	}
</script>

<h1>Chat Interface</h1>

<video bind:this={localVideo} autoplay muted>
	<!-- Dummy track for accessibility -->
	<track kind="captions" />
</video>
<video bind:this={remoteVideo} autoplay>
	<!-- Dummy track for accessibility -->
	<track kind="captions" />
</video>

<input bind:this={callInput} />
<button on:click={handleCall}>Call</button>
<button on:click={handleAnswer}>Answer</button>
<button on:click={endWebRTC}>End Chat</button>
