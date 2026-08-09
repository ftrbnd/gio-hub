import { NextFunction, Request, Response } from 'express';

function createBearerAuth(envVarName: string) {
	return function authenticateBearer(req: Request, res: Response, next: NextFunction) {
		const auth = req.get('authorization') || '';
		const expected = process.env[envVarName];
		if (!expected) {
			console.error(`[${req.requestId}] server missing ${envVarName} configuration`);
			return res
				.status(500)
				.json({ error: `Server missing ${envVarName} configuration` });
		}
		if (auth !== `Bearer ${expected}`) {
			console.warn(
				`[${req.requestId}] unauthorized: authorization header ${auth ? 'present but did not match' : 'missing'}`,
			);
			return res.status(401).json({ error: 'Unauthorized' });
		}
		next();
	};
}

export const authenticate = createBearerAuth('API_SECRET');
export const authenticateCron = createBearerAuth('CRON_SECRET');
