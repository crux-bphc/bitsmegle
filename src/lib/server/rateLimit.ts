/**
 * In-memory sliding-window rate limiter. There's no shared infra (Redis etc.)
 * for this app, and per-process memory resets on restart same as the other
 * in-memory state (see server/src/services/realtime.ts) - acceptable here
 * since this only needs to blunt casual abuse, not survive a determined
 * distributed attacker.
 */
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
	const now = Date.now();
	const recentHits = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

	if (recentHits.length >= maxRequests) {
		hits.set(key, recentHits);
		return true;
	}

	recentHits.push(now);
	hits.set(key, recentHits);
	return false;
}
