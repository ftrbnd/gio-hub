import { Request, Response } from 'express';
import * as spotifyService from '@/services/spotify.service';

export async function loginRedirect(req: Request, res: Response) {
	const secret = typeof req.query.secret === 'string' ? req.query.secret : '';
	const expected = process.env.API_SECRET;
	if (!expected) {
		console.error(`[${req.requestId}] server missing API_SECRET configuration`);
		return res
			.status(500)
			.json({ error: 'Server missing API_SECRET configuration' });
	}
	if (secret !== expected) {
		console.warn(`[${req.requestId}] rejected /spotify/login: missing or incorrect secret`);
		return res.status(401).json({ error: 'Unauthorized' });
	}

	try {
		const state = await spotifyService.createAndStoreOAuthState();
		const url = spotifyService.buildAuthorizeUrl(state);
		res.redirect(url);
	} catch (err) {
		console.error(`[${req.requestId}] failed to start Spotify OAuth flow:`, err);
		res.status(500).json({ error: 'Failed to start Spotify OAuth flow' });
	}
}

export async function callback(req: Request, res: Response) {
	const { code, state, error } = req.query;

	if (typeof error === 'string') {
		console.warn(`[${req.requestId}] Spotify OAuth denied: ${error}`);
		return res.status(400).send('Spotify authorization was denied. You can close this tab.');
	}
	if (typeof code !== 'string' || typeof state !== 'string') {
		console.warn(`[${req.requestId}] Spotify callback missing code or state`);
		return res
			.status(400)
			.send('Missing code or state. You can close this tab and try again.');
	}

	const validState = await spotifyService.verifyAndConsumeOAuthState(state);
	if (!validState) {
		console.warn(`[${req.requestId}] Spotify callback: invalid or expired state`);
		return res
			.status(400)
			.send('This authorization link expired or was already used. Please start over at /spotify/login.');
	}

	try {
		const { refreshToken } = await spotifyService.exchangeCodeForTokens(code);
		if (!refreshToken) {
			throw new Error('Spotify did not return a refresh token');
		}
		await spotifyService.storeRefreshToken(refreshToken);
		console.log(`[${req.requestId}] Spotify account connected successfully`);
		res.send('Spotify connected — you can close this tab.');
	} catch (err) {
		console.error(`[${req.requestId}] Spotify OAuth callback failed:`, err);
		res
			.status(502)
			.send('Failed to connect your Spotify account. Check the server logs and try again.');
	}
}

export async function sync(req: Request, res: Response) {
	try {
		const result = await spotifyService.runWeeklySync();
		console.log(`[${req.requestId}] Spotify sync complete: ${JSON.stringify(result)}`);
		res.json(result);
	} catch (err) {
		if (err instanceof spotifyService.SpotifyNotConnectedError) {
			console.warn(`[${req.requestId}] Spotify sync skipped: not connected`);
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] Spotify sync failed:`, err);
		res.status(502).json({ error: 'Spotify sync failed' });
	}
}
