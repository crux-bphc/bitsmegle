import { Router, Request, Response } from 'express';
import { state } from '../services/realtime';

const router = Router();

function formatElapsedTime(startIso: string) {
	const elapsedMs = Date.now() - new Date(startIso).getTime();
	let seconds = Math.floor(elapsedMs / 1000);
	let minutes = Math.floor(seconds / 60);
	let hours = Math.floor(minutes / 60);
	let days = Math.floor(hours / 24);

	seconds %= 60;
	minutes %= 60;
	hours %= 24;

	return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}

// GET /stats
// Returns overall server statistics including uptime
router.get('/', (_req: Request, res: Response) => {
	const { stats } = state;
	const elapsedTimeMs = Date.now() - new Date(stats.serverStartTime).getTime();
	const elapsedTimeReadable = formatElapsedTime(stats.serverStartTime);

	res.json({
		totalUsersConnected: stats.totalUsersConnected,
		maxActiveUserCount: stats.maxActiveUserCount,
		totalCallsMade: stats.totalCallsMade,
		totalCallsPaired: stats.totalCallsPaired,
		serverStartTime: stats.serverStartTime,
		elapsedTime: elapsedTimeMs,
		elapsedTimeReadable
	});
});

// GET /stats/user-count
// Returns current number of connected users
router.get('/user-count', (_req: Request, res: Response) => {
	res.json({ userCount: state.userCount });
});

// GET /stats/calls
// Returns stats about calls
router.get('/calls', (_req: Request, res: Response) => {
	const { calls } = state;
	const total = calls.length;
	const notPaired = calls.filter((c) => !c.paired).length;
	const paired = calls.filter((c) => c.paired).length;
	const notAnswered = calls.filter((c) => c.answer == null).length;
	const answered = total - notAnswered;

	res.json({ total, notPaired, paired, notAnswered, answered });
});

// GET /stats/interactions
// Returns stats about reputation interactions
router.get('/interactions', (_req: Request, res: Response) => {
	const { interactions } = state;
	let totalInteractions = 0;
	for (const userId in interactions) {
		totalInteractions += interactions[userId].length;
	}
	res.json({ totalInteractions, interactions });
});

export default router;
