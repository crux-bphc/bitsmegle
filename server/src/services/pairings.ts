import { state } from './realtime';

/**
 * How long after a call ends a participant may still submit a rating for it.
 * The rating UI appears immediately on disconnect, so this only needs to cover
 * the user thinking about it — an hour is generous.
 */
export const PAIRING_TTL_MS = 60 * 60 * 1000;

/** Safety valve so the ledger cannot grow without bound on a quiet-then-busy server. */
const MAX_PAIRINGS = 10_000;

export interface Pairing {
	callId: string;
	/** Server-derived ids of the two people who were actually connected. */
	participants: [string, string];
	createdAt: number;
	/** Ids that have already spent their one rating for this call. */
	ratedBy: string[];
}

export type RatingClaim = 'ok' | 'not-paired' | 'already-rated';

function prune(now: number): void {
	state.pairings = state.pairings.filter((p) => now - p.createdAt < PAIRING_TTL_MS);
	if (state.pairings.length > MAX_PAIRINGS) {
		state.pairings = state.pairings.slice(-MAX_PAIRINGS);
	}
}

/**
 * Records that two users were genuinely connected to each other, which is what
 * entitles each of them to rate the other. Both ids must be server-derived from
 * a verified token; a client-supplied id here would defeat the whole check.
 */
export function recordPairing(callId: string, a: string, b: string, now = Date.now()): void {
	if (!a || !b || a === b) return;
	prune(now);
	// A call is only ever paired once; guard against a duplicate `call-accepted`.
	if (state.pairings.some((p) => p.callId === callId)) return;
	state.pairings.push({ callId, participants: [a, b], createdAt: now, ratedBy: [] });
}

/**
 * Spends `rater`'s rating of `target`, if the two were in fact paired recently
 * and `rater` has not already rated that call. Returns why it was refused
 * otherwise. This is the authorisation check for `POST /api/users/rep`.
 */
export function claimRating(rater: string, target: string, now = Date.now()): RatingClaim {
	prune(now);
	const pairing = state.pairings.find(
		(p) => p.participants.includes(rater) && p.participants.includes(target)
	);
	if (!pairing) return 'not-paired';
	if (pairing.ratedBy.includes(rater)) return 'already-rated';
	pairing.ratedBy.push(rater);
	return 'ok';
}

/**
 * Undoes a `claimRating` when the write it was gating didn't actually succeed
 * (the target no longer exists, or the update itself failed), so the rating
 * isn't permanently lost. No-op if no matching pairing is found.
 */
export function releaseRatingClaim(rater: string, target: string, now = Date.now()): void {
	prune(now);
	const pairing = state.pairings.find(
		(p) => p.participants.includes(rater) && p.participants.includes(target)
	);
	if (!pairing) return;
	pairing.ratedBy = pairing.ratedBy.filter((id) => id !== rater);
}
