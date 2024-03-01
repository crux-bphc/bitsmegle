import { writable } from 'svelte/store';

export const user = writable(null); // Initially, the user is not logged in
