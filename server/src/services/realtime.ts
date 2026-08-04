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

/** Maps a rater's id to the ids they've rated, each with when that rating was recorded. */
export type InteractionsMap = Record<string, Record<string, number>>;

/** How long an "already rated" lock lasts before the same pair can be rated again. */
export const INTERACTION_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

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

/**
 * True if `raterId` rated `targetId` within the last `INTERACTION_LOCK_TTL_MS`.
 * A stale lock is pruned as a side effect, so the map doesn't hold entries
 * forever once the pair they're for is looked at again.
 */
export function hasActiveInteractionLock(
	raterId: string,
	targetId: string,
	now = Date.now()
): boolean {
	const ratedAt = state.interactions[raterId]?.[targetId];
	if (ratedAt === undefined) return false;
	if (now - ratedAt < INTERACTION_LOCK_TTL_MS) return true;

	delete state.interactions[raterId][targetId];
	if (Object.keys(state.interactions[raterId]).length === 0) delete state.interactions[raterId];
	return false;
}

/** Records that `raterId` just rated `targetId`, starting a fresh lock window. */
export function recordInteraction(raterId: string, targetId: string, now = Date.now()): void {
	state.interactions[raterId] = state.interactions[raterId] || {};
	state.interactions[raterId][targetId] = now;
}
