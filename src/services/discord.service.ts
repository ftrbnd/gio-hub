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
