import { Request, Response } from 'express';
import * as discordService from '@/services/discord.service';
import * as googleCalendarService from '@/services/googleCalendar.service';
import * as timeOffReminderService from '@/services/timeOffReminder.service';

export async function loginRedirect(req: Request, res: Response) {
	try {
		const state = await googleCalendarService.createAndStoreOAuthState();
		const url = googleCalendarService.buildAuthorizeUrl(state);
		res.redirect(url);
	} catch (err) {
		console.error(`[${req.requestId}] failed to start Google Calendar OAuth flow:`, err);
		discordService.notifyErrorDM(
			req.requestId,
			'failed to start Google Calendar OAuth flow',
			err,
		);
		res.status(500).json({ error: 'Failed to start Google Calendar OAuth flow' });
	}
}

export async function callback(req: Request, res: Response) {
	const { code, state, error } = req.query;

	if (typeof error === 'string') {
		console.warn(`[${req.requestId}] Google Calendar OAuth denied: ${error}`);
		return res
			.status(400)
			.send('Google Calendar authorization was denied. You can close this tab.');
	}
	if (typeof code !== 'string' || typeof state !== 'string') {
		console.warn(`[${req.requestId}] Google Calendar callback missing code or state`);
		return res
			.status(400)
			.send('Missing code or state. You can close this tab and try again.');
	}

	const validState = await googleCalendarService.verifyAndConsumeOAuthState(state);
	if (!validState) {
		console.warn(`[${req.requestId}] Google Calendar callback: invalid or expired state`);
		return res
			.status(400)
			.send(
				'This authorization link expired or was already used. Please start over at /calendar/login.',
			);
	}

	try {
		const { refreshToken } = await googleCalendarService.exchangeCodeForTokens(code);
		if (!refreshToken) {
			throw new Error('Google did not return a refresh token');
		}
		await googleCalendarService.storeRefreshToken(refreshToken);
		console.log(`[${req.requestId}] Google Calendar connected successfully`);
		res.send('Google Calendar connected — you can close this tab.');
	} catch (err) {
		console.error(`[${req.requestId}] Google Calendar OAuth callback failed:`, err);
		discordService.notifyErrorDM(req.requestId, 'Google Calendar OAuth callback failed', err);
		res
			.status(502)
			.send(
				'Failed to connect Google Calendar. Check the server logs and try again.',
			);
	}
}

export async function calendars(req: Request, res: Response) {
	try {
		const list = await googleCalendarService.listCalendars();
		res.json(list);
	} catch (err) {
		if (err instanceof googleCalendarService.GoogleCalendarNotConnectedError) {
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] failed to list Google calendars:`, err);
		discordService.notifyErrorDM(req.requestId, 'failed to list Google calendars', err);
		res.status(502).json({ error: 'Failed to list Google calendars' });
	}
}

export async function timeOffSync(req: Request, res: Response) {
	try {
		const result = await timeOffReminderService.runTimeOffSync(req.requestId);
		res.json(result);
	} catch (err) {
		if (err instanceof googleCalendarService.GoogleCalendarNotConnectedError) {
			return res.status(409).json({ error: err.message });
		}
		console.error(`[${req.requestId}] time off sync failed:`, err);
		discordService.notifyErrorDM(req.requestId, 'time off sync failed', err);
		res.status(502).json({ error: 'Time off sync failed' });
	}
}
