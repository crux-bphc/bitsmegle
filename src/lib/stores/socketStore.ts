import { writable } from 'svelte/store';
import { Socket } from 'socket.io-client';

export const socket = writable<Socket | null>(null);
