import { writable } from 'svelte/store';

export const user = writable(null); // Initially, the user is not logged in
export const remoteUser = writable(null); // Initially, remote user is not connected
