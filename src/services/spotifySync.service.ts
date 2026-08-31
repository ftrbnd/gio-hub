import * as discordService from '@/services/discord.service';
import * as spotifyService from '@/services/spotify.service';
import * as ticktickService from '@/services/ticktick.service';
import { SyncResult } from '@/models/spotify.model';

export type WeeklySyncFollowUp = SyncResult & {
	ticktickTaskCreated: boolean;
	discordMessageSent: boolean;
};

/**
 * Runs the Spotify weekly sync, then optionally creates a TickTick reminder
 * and DMs the Discord summary — shared by the cron route and the admin UI.
 */
export async function runWeeklySyncWithFollowUp(
	requestId: string | undefined,
): Promise<WeeklySyncFollowUp> {
	const result = await spotifyService.runWeeklySync();
	console.log(`[${requestId}] Spotify sync complete: ${JSON.stringify(result)}`);

	const reminderEnabled = await ticktickService.isReminderEnabled();

	let ticktickTaskCreated = false;
	if (reminderEnabled) {
		try {
			await ticktickService.createCheckPlaylistTask(
				spotifyService.playlistUrl(result.playlistId),
			);
			ticktickTaskCreated = true;
		} catch (err) {
			console.error(`[${requestId}] failed to create TickTick task:`, err);
			discordService.notifyErrorDM(requestId, 'failed to create TickTick task', err);
		}
	}

	let discordMessageSent = false;
	try {
		await discordService.sendEmbed(spotifyService.weeklySummaryEmbed(result), [
			ticktickService.reminderToggleButtonRow(reminderEnabled),
		]);
		discordMessageSent = true;
	} catch (err) {
		console.error(`[${requestId}] failed to send Discord summary:`, err);
	}

	return { ...result, ticktickTaskCreated, discordMessageSent };
}
