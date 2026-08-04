import type { Socket } from 'socket.io';
import type { Identity } from './identity';
import type { Pairing } from './pairings';

export interface Call {
	callId: string;
	offer: any;
	offerMaker: Socket;
	/** Server-derived, never taken from the client payload. */
	offerMakerUser: Identity;
	answer: any;
	answerMaker: Socket | null;
	/** Set when a searcher is matched, before they confirm with `call-accepted`. */
	pendingAnswerMaker: Socket | null;
	answerMakerUser: Identity | null;
	offerCandidates: any[];
	answerCandidates: any[];
	paired: boolean;
}

export type InteractionsMap = Record<string, string[]>;

export const state = {
	userCount: 0,
	calls: [] as Call[],
	interactions: {} as InteractionsMap,
	/** Calls that actually connected, and so entitle their participants to rate each other. */
	pairings: [] as Pairing[],
	stats: {
		totalUsersConnected: 0,
		maxActiveUserCount: 0,
		totalCallsMade: 0,
		totalCallsPaired: 0,
		serverStartTime: new Date().toISOString()
	}
};
