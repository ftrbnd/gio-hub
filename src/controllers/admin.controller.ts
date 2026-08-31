import { Request, Response } from 'express';
import * as adminService from '@/services/admin.service';
import * as adminSession from '@/services/adminSession.service';
import * as discordService from '@/services/discord.service';
import * as googleAuth from '@/services/googleAuth.service';
import * as spotifyService from '@/services/spotify.service';
import * as spotifySyncService from '@/services/spotifySync.service';
import * as ticktickService from '@/services/ticktick.service';

export async function googleLogin(_req: Request, res: Response) {
	try {
		const state = await googleAuth.createAndStoreOAuthState();
		res.redirect(googleAuth.buildAuthorizeUrl(state));
	} catch (err) {
		console.error('[admin] failed to start Google OAuth:', err);
		res.status(500).send('Failed to start Google sign-in. Check server configuration.');
	}
}

export async function googleCallback(req: Request, res: Response) {
	const { code, state, error } = req.query;

	if (typeof error === 'string') {
		console.warn(`[${req.requestId}] Google OAuth denied: ${error}`);
		return res.redirect('/?error=denied');
	}
	if (typeof code !== 'string' || typeof state !== 'string') {
		return res.redirect('/?error=missing');
	}

	const validState = await googleAuth.verifyAndConsumeOAuthState(state);
	if (!validState) {
		return res.redirect('/?error=state');
	}

	try {
		const accessToken = await googleAuth.exchangeCodeForAccessToken(code);
		const email = await googleAuth.fetchUserEmail(accessToken);
		if (!googleAuth.isAllowedAdminEmail(email)) {
			console.warn(`[${req.requestId}] Google sign-in rejected for ${email}`);
			return res.redirect('/?error=forbidden');
		}
		adminSession.setSessionCookie(res, email);
		console.log(`[${req.requestId}] admin signed in as ${email}`);
		res.redirect('/');
	} catch (err) {
		console.error(`[${req.requestId}] Google OAuth callback failed:`, err);
		res.redirect('/?error=oauth');
	}
}

export function me(req: Request, res: Response) {
	const session = adminSession.readSession(req);
	if (!session) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	res.json({ email: session.email });
}

export function logout(_req: Request, res: Response) {
	adminSession.clearSessionCookie(res);
	res.json({ ok: true });
}

export async function status(req: Request, res: Response) {
	try {
		res.json(await adminService.getStatus());
	} catch (err) {
		console.error(`[${req.requestId}] failed to load admin status:`, err);
		res.status(500).json({ error: 'Failed to load status' });
	}
}

export async function syncSpotify(req: Request, res: Response) {
	try {
		const result = await spotifySyncService.runWeeklySyncWithFollowUp(req.requestId);
		res.json(result);
	} catch (err) {
		if (err instanceof spotifyService.SpotifyNotConnectedError) {
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] admin Spotify sync failed:`, err);
		discordService.notifyErrorDM(req.requestId, 'admin Spotify sync failed', err);
		res.status(502).json({ error: 'Spotify sync failed' });
	}
}

export async function connectSpotify(req: Request, res: Response) {
	try {
		const state = await spotifyService.createAndStoreOAuthState();
		res.redirect(spotifyService.buildAuthorizeUrl(state));
	} catch (err) {
		console.error(`[${req.requestId}] failed to start Spotify OAuth from admin:`, err);
		res.status(500).json({ error: 'Failed to start Spotify OAuth' });
	}
}

export async function connectTickTick(req: Request, res: Response) {
	try {
		const state = await ticktickService.createAndStoreOAuthState();
		res.redirect(ticktickService.buildAuthorizeUrl(state));
	} catch (err) {
		console.error(`[${req.requestId}] failed to start TickTick OAuth from admin:`, err);
		res.status(500).json({ error: 'Failed to start TickTick OAuth' });
	}
}

export async function setReminder(req: Request, res: Response) {
	const enabled = req.body?.enabled;
	if (typeof enabled !== 'boolean') {
		return res.status(400).json({ error: 'Body must include boolean "enabled"' });
	}
	try {
		await ticktickService.setReminderEnabled(enabled);
		res.json({ enabled });
	} catch (err) {
		console.error(`[${req.requestId}] failed to set TickTick reminder:`, err);
		res.status(500).json({ error: 'Failed to update reminder' });
	}
}

export async function listProjects(req: Request, res: Response) {
	try {
		const list = await ticktickService.listProjects();
		res.json(list);
	} catch (err) {
		if (err instanceof ticktickService.TickTickNotConnectedError) {
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] failed to list TickTick projects:`, err);
		res.status(502).json({ error: 'Failed to list TickTick projects' });
	}
}

export async function testDiscord(req: Request, res: Response) {
	try {
		await discordService.sendDirectMessage(
			'gHub: this is a test message — Discord DMs are wired up correctly.',
		);
		res.json({ sent: true });
	} catch (err) {
		console.error(`[${req.requestId}] failed to send Discord DM:`, err);
		res.status(502).json({ error: 'Failed to send Discord DM' });
	}
}
