import { writable } from 'svelte/store';

export const localStream = writable<MediaStream | null>(null);
export const remoteStream = writable<MediaStream | null>(null);
