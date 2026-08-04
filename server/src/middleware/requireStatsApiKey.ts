import { NextFunction, Request, Response } from 'express';
import { STATS_API_KEY } from '../config/env';

function extractKey(req: Request): string | undefined {
	const header = req.header('Authorization');
	if (header?.startsWith('Bearer ')) {
		return header.slice('Bearer '.length);
	}
	return req.header('X-API-Key');
}

export function requireStatsApiKey(req: Request, res: Response, next: NextFunction) {
	const key = extractKey(req);
	if (!key || key !== STATS_API_KEY) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	next();
}
