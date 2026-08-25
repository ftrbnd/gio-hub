import { Request, Response } from 'express';
import * as discordService from '@/services/discord.service';
import * as ticktickService from '@/services/ticktick.service';

export async function loginRedirect(req: Request, res: Response) {
	try {
		const state = await ticktickService.createAndStoreOAuthState();
		const url = ticktickService.buildAuthorizeUrl(state);
		res.redirect(url);
	} catch (err) {
		console.error(`[${req.requestId}] failed to start TickTick OAuth flow:`, err);
		discordService.notifyErrorDM(req.requestId, 'failed to start TickTick OAuth flow', err);
		res.status(500).json({ error: 'Failed to start TickTick OAuth flow' });
	}
}

export async function callback(req: Request, res: Response) {
	const { code, state, error } = req.query;

	if (typeof error === 'string') {
		console.warn(`[${req.requestId}] TickTick OAuth denied: ${error}`);
		return res.status(400).send('TickTick authorization was denied. You can close this tab.');
	}
	if (typeof code !== 'string' || typeof state !== 'string') {
		console.warn(`[${req.requestId}] TickTick callback missing code or state`);
		return res
			.status(400)
			.send('Missing code or state. You can close this tab and try again.');
	}

	const validState = await ticktickService.verifyAndConsumeOAuthState(state);
	if (!validState) {
		console.warn(`[${req.requestId}] TickTick callback: invalid or expired state`);
		return res
			.status(400)
			.send('This authorization link expired or was already used. Please start over at /ticktick/login.');
	}

	try {
		const accessToken = await ticktickService.exchangeCodeForToken(code);
		await ticktickService.storeAccessToken(accessToken);
		console.log(`[${req.requestId}] TickTick account connected successfully`);
		res.send('TickTick connected — you can close this tab.');
	} catch (err) {
		console.error(`[${req.requestId}] TickTick OAuth callback failed:`, err);
		discordService.notifyErrorDM(req.requestId, 'TickTick OAuth callback failed', err);
		res
			.status(502)
			.send('Failed to connect your TickTick account. Check the server logs and try again.');
	}
}

export async function projects(req: Request, res: Response) {
	try {
		const list = await ticktickService.listProjects();
		res.json(list);
	} catch (err) {
		if (err instanceof ticktickService.TickTickNotConnectedError) {
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] failed to list TickTick projects:`, err);
		discordService.notifyErrorDM(req.requestId, 'failed to list TickTick projects', err);
		res.status(502).json({ error: 'Failed to list TickTick projects' });
	}
}
