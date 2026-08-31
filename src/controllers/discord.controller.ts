import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { Request, Response } from 'express';
import * as discordService from '@/services/discord.service';
import * as filmService from '@/services/film.service';
import * as ticktickService from '@/services/ticktick.service';

export async function sendTestMessage(req: Request, res: Response) {
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

async function handleFilmInteraction(req: Request, res: Response, customId: string) {
	const parsed = filmService.parseFilmCustomId(customId);
	if (!parsed) {
		return res.status(400).json({ error: 'Unhandled film interaction' });
	}

	const applicationId = interactionApplicationId(req.body);
	const token = req.body.token as string | undefined;
	if (!applicationId || !token) {
		console.error(`[${req.requestId}] film interaction missing application_id or token`);
		return res.status(400).json({ error: 'Invalid interaction payload' });
	}

	if (parsed.kind === 'nav') {
		try {
			const { sessionId, session } = await filmService.navigateReview(
				parsed.sessionId,
				parsed.direction,
			);
			const payload = filmService.reviewMessagePayload(sessionId, session);
			console.log(
				`[${req.requestId}] film review nav ${parsed.direction} → ${session.index + 1}/${session.photos.length}`,
			);
			return res.json({
				type: InteractionResponseType.UPDATE_MESSAGE,
				data: payload,
			});
		} catch (err) {
			if (err instanceof filmService.FilmReviewSessionExpiredError) {
				return res.json({
					type: InteractionResponseType.UPDATE_MESSAGE,
					data: {
						content: err.message,
						embeds: [],
						components: [],
					},
				});
			}
			console.error(`[${req.requestId}] film review nav failed:`, err);
			discordService.notifyErrorDM(req.requestId, 'film review nav failed', err);
			return res.json({
				type: InteractionResponseType.UPDATE_MESSAGE,
				data: {
					content: 'Failed to navigate film review. Check server logs.',
					embeds: [],
					components: [],
				},
			});
		}
	}

	// Rotations can exceed Discord's 3s interaction window — defer, then edit.
	res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

	try {
		const { sessionId, session } = await filmService.applyReviewRotation(
			parsed.sessionId,
			parsed.angle,
		);
		const payload = filmService.reviewMessagePayload(sessionId, session);
		console.log(
			`[${req.requestId}] film review rotated ${filmService.displayName(session.photos[session.index].publicId)} by ${parsed.angle}°`,
		);
		await discordService.editInteractionMessage(applicationId, token, payload);
	} catch (err) {
		const message =
			err instanceof filmService.FilmReviewSessionExpiredError
				? err.message
				: 'Failed to rotate photo. Check server logs.';
		console.error(`[${req.requestId}] film review rotate failed:`, err);
		if (!(err instanceof filmService.FilmReviewSessionExpiredError)) {
			discordService.notifyErrorDM(req.requestId, 'film review rotate failed', err);
		}
		try {
			await discordService.editInteractionMessage(applicationId, token, {
				content: message,
				embeds: [],
				components: [],
			});
		} catch (editErr) {
			console.error(`[${req.requestId}] failed to edit deferred film rotate message:`, editErr);
		}
	}
}

function interactionApplicationId(body: { application_id?: unknown }): string | undefined {
	return typeof body.application_id === 'string' ? body.application_id : undefined;
}

export async function interactions(req: Request, res: Response) {
	const interaction = req.body;

	if (interaction.type === InteractionType.PING) {
		return res.json({ type: InteractionResponseType.PONG });
	}

	if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
		const customId =
			typeof interaction.data?.custom_id === 'string'
				? interaction.data.custom_id
				: '';

		if (customId === ticktickService.REMINDER_TOGGLE_CUSTOM_ID) {
			const enabled = !(await ticktickService.isReminderEnabled());
			await ticktickService.setReminderEnabled(enabled);
			console.log(
				`[${req.requestId}] TickTick reminder toggled ${enabled ? 'on' : 'off'} via Discord`,
			);
			return res.json({
				type: InteractionResponseType.UPDATE_MESSAGE,
				data: { components: [ticktickService.reminderToggleButtonRow(enabled)] },
			});
		}

		if (customId.startsWith(filmService.FILM_CUSTOM_ID_PREFIX)) {
			return handleFilmInteraction(req, res, customId);
		}
	}

	res.status(400).json({ error: 'Unhandled interaction' });
}
