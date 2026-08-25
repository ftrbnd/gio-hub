import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { Request, Response } from 'express';
import * as discordService from '@/services/discord.service';
import * as ticktickService from '@/services/ticktick.service';

export async function sendTestMessage(req: Request, res: Response) {
	try {
		await discordService.sendDirectMessage(
			'gio-hub: this is a test message — Discord DMs are wired up correctly.',
		);
		res.json({ sent: true });
	} catch (err) {
		console.error(`[${req.requestId}] failed to send Discord DM:`, err);
		res.status(502).json({ error: 'Failed to send Discord DM' });
	}
}

export async function interactions(req: Request, res: Response) {
	const interaction = req.body;

	if (interaction.type === InteractionType.PING) {
		return res.json({ type: InteractionResponseType.PONG });
	}

	if (
		interaction.type === InteractionType.MESSAGE_COMPONENT &&
		interaction.data?.custom_id === ticktickService.REMINDER_TOGGLE_CUSTOM_ID
	) {
		const enabled = !(await ticktickService.isReminderEnabled());
		await ticktickService.setReminderEnabled(enabled);
		console.log(`[${req.requestId}] TickTick reminder toggled ${enabled ? 'on' : 'off'} via Discord`);
		return res.json({
			type: InteractionResponseType.UPDATE_MESSAGE,
			data: { components: [ticktickService.reminderToggleButtonRow(enabled)] },
		});
	}

	res.status(400).json({ error: 'Unhandled interaction' });
}
