import { writable } from 'svelte/store';
import type { User } from '$lib/types';

export const user = writable<User | null>(null); // Initially, the user is not logged in
export const remoteUser = writable<User | null>(null); // Initially, remote user is not connected
