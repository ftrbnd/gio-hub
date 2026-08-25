import { NextFunction, Request, Response } from 'express';
import * as discordService from '@/services/discord.service';

function createBearerAuth(envVarName: string) {
	return function authenticateBearer(req: Request, res: Response, next: NextFunction) {
		const auth = req.get('authorization') || '';
		const expected = process.env[envVarName];
		if (!expected) {
			console.error(`[${req.requestId}] server missing ${envVarName} configuration`);
			discordService.notifyErrorDM(req.requestId, `server missing ${envVarName} configuration`);
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

function createQuerySecretAuth(envVarName: string) {
	return function authenticateQuerySecret(req: Request, res: Response, next: NextFunction) {
		const secret = typeof req.query.secret === 'string' ? req.query.secret : '';
		const expected = process.env[envVarName];
		if (!expected) {
			console.error(`[${req.requestId}] server missing ${envVarName} configuration`);
			discordService.notifyErrorDM(req.requestId, `server missing ${envVarName} configuration`);
			return res
				.status(500)
				.json({ error: `Server missing ${envVarName} configuration` });
		}
		if (secret !== expected) {
			console.warn(
				`[${req.requestId}] unauthorized: query secret ${secret ? 'present but did not match' : 'missing'}`,
			);
			return res.status(401).json({ error: 'Unauthorized' });
		}
		next();
	};
}

export const authenticateQuerySecret = createQuerySecretAuth('API_SECRET');
