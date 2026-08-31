import { redis } from '@/config/redis';
import * as spotifyService from '@/services/spotify.service';
import * as ticktickService from '@/services/ticktick.service';

function envConfigured(name: string): boolean {
	return Boolean(process.env[name]?.trim());
}

export type AdminStatus = {
	spotify: {
		configured: boolean;
		connected: boolean;
		monthKey: string;
		playlistId: string | null;
		playlistUrl: string | null;
	};
	ticktick: {
		configured: boolean;
		connected: boolean;
		reminderEnabled: boolean;
		projectIdConfigured: boolean;
	};
	discord: {
		configured: boolean;
	};
	film: {
		cloudinaryConfigured: boolean;
		anthropicConfigured: boolean;
	};
	google: {
		configured: boolean;
		adminEmailConfigured: boolean;
	};
};

export async function getStatus(): Promise<AdminStatus> {
	const monthKey = spotifyService.currentMonthKey();
	const [spotifyRefresh, ticktickToken, reminderEnabled, playlistId] =
		await Promise.all([
			spotifyService.getRefreshToken(),
			ticktickService.getAccessToken(),
			ticktickService.isReminderEnabled(),
			redis.get<string>(`spotify:playlist:${monthKey}`),
		]);

	return {
		spotify: {
			configured:
				envConfigured('SPOTIFY_CLIENT_ID') &&
				envConfigured('SPOTIFY_CLIENT_SECRET') &&
				envConfigured('SPOTIFY_REDIRECT_URI'),
			connected: Boolean(spotifyRefresh),
			monthKey,
			playlistId: playlistId ?? null,
			playlistUrl: playlistId ? spotifyService.playlistUrl(playlistId) : null,
		},
		ticktick: {
			configured:
				envConfigured('TICKTICK_CLIENT_ID') &&
				envConfigured('TICKTICK_CLIENT_SECRET') &&
				envConfigured('TICKTICK_REDIRECT_URI'),
			connected: Boolean(ticktickToken),
			reminderEnabled,
			projectIdConfigured: envConfigured('TICKTICK_PROJECT_ID'),
		},
		discord: {
			configured:
				envConfigured('DISCORD_BOT_TOKEN') && envConfigured('DISCORD_USER_ID'),
		},
		film: {
			cloudinaryConfigured: envConfigured('CLOUDINARY_URL'),
			anthropicConfigured: envConfigured('ANTHROPIC_API_KEY'),
		},
		google: {
			configured:
				envConfigured('GOOGLE_CLIENT_ID') &&
				envConfigured('GOOGLE_CLIENT_SECRET') &&
				envConfigured('GOOGLE_REDIRECT_URI') &&
				envConfigured('SESSION_SECRET'),
			adminEmailConfigured: envConfigured('ADMIN_GOOGLE_EMAIL'),
		},
	};
}
