// Shared types for the client-side application

export interface User {
	_id?: string;
	id: string; // bits id f20230043h
	name: string;
	email: string;
	picture: string;
	reputation: number;
}

export interface TokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
	token_type: string;
	id_token?: string;
	expiry_date?: number;
}

export interface Message {
	sender: string;
	message: string;
	timestamp?: number;
}
