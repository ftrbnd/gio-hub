import crypto from 'node:crypto';
import { redis } from '@/config/redis';

const OAUTH_STATE_TTL_SECONDS = 600;

export async function createAndStoreOAuthState(namespace: string): Promise<string> {
	const state = crypto.randomUUID();
	await redis.set(`${namespace}:oauth:state:${state}`, '1', {
		ex: OAUTH_STATE_TTL_SECONDS,
	});
	return state;
}

export async function verifyAndConsumeOAuthState(
	namespace: string,
	state: string,
): Promise<boolean> {
	const key = `${namespace}:oauth:state:${state}`;
	const exists = await redis.get(key);
	if (!exists) return false;
	await redis.del(key);
	return true;
}
