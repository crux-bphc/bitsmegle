import { writable } from 'svelte/store';

export const currentStatus = writable<string>('Idle');
