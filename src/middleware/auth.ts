import { NextFunction, Request, Response } from 'express';

export function authenticate(req: Request, res: Response, next: NextFunction) {
	const auth = req.get('authorization') || '';
	const expected = process.env.API_SECRET;
	if (!expected) {
		console.error(`[${req.requestId}] server missing API_SECRET configuration`);
		return res
			.status(500)
			.json({ error: 'Server missing API_SECRET configuration' });
	}
	if (auth !== `Bearer ${expected}`) {
		console.warn(
			`[${req.requestId}] unauthorized: authorization header ${auth ? 'present but did not match' : 'missing'}`,
		);
		return res.status(401).json({ error: 'Unauthorized' });
	}
	next();
}
