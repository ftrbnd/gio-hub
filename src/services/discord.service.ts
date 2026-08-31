import { Routes } from 'discord.js';
import { discordRest } from '@/config/discord';
import { requireEnv } from '@/lib/env';
import {
	DiscordActionRow,
	DiscordChannelResponseSchema,
	DiscordEmbed,
	DiscordMessageResponseSchema,
} from '@/models/discord.model';

/**
 * Opens (or reuses) the DM channel with your personal Discord account.
 *
 * Requires DISCORD_BOT_TOKEN (a bot application you own) and DISCORD_USER_ID
 * (your account's ID). The bot must share at least one server with you —
 * Discord won't let a bot open a DM with someone otherwise.
 */
async function openDmChannel(): Promise<string> {
	const recipientId = requireEnv('DISCORD_USER_ID');
	const channel = DiscordChannelResponseSchema.parse(
		await discordRest.post(Routes.userChannels(), {
			body: { recipient_id: recipientId },
		}),
	);
	return channel.id;
}

export async function sendDirectMessage(content: string): Promise<void> {
	const channelId = await openDmChannel();
	DiscordMessageResponseSchema.parse(
		await discordRest.post(Routes.channelMessages(channelId), {
			body: { content },
		}),
	);
}

export async function sendEmbed(
	embed: DiscordEmbed,
	components?: DiscordActionRow[],
): Promise<void> {
	const channelId = await openDmChannel();
	DiscordMessageResponseSchema.parse(
		await discordRest.post(Routes.channelMessages(channelId), {
			body: { embeds: [embed], components },
		}),
	);
}

/** Edit the original message for a deferred component interaction. */
export async function editInteractionMessage(
	applicationId: string,
	interactionToken: string,
	data: { embeds?: DiscordEmbed[]; components?: DiscordActionRow[]; content?: string },
): Promise<void> {
	DiscordMessageResponseSchema.parse(
		await discordRest.patch(
			Routes.webhookMessage(applicationId, interactionToken, '@original'),
			{ body: data, auth: false },
		),
	);
}

export async function notifyError(context: string, err?: unknown): Promise<void> {
	const message = err === undefined ? undefined : err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack : undefined;

	await sendEmbed({
		title: 'gHub error',
		description: message ? `**${context}**\n${message}` : `**${context}**`,
		color: 0xed4245,
		fields: stack
			? [{ name: 'Stack', value: `\`\`\`${stack.slice(0, 1000)}\`\`\`` }]
			: undefined,
	});
}

// Fire-and-forget: logs to the console if the DM itself fails, but never
// throws back into the caller (an error path is the wrong place to await
// a network call, or to let a Discord outage compound the original error).
export function notifyErrorDM(requestId: string | undefined, context: string, err?: unknown): void {
	notifyError(context, err).catch((notifyErr) =>
		console.error(`[${requestId}] failed to send Discord error DM:`, notifyErr),
	);
}
