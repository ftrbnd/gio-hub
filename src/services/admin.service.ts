import { redis } from '@/config/redis';
import * as googleCalendarService from '@/services/googleCalendar.service';
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
		playlistName: string;
		playlistId: string | null;
		playlistUrl: string | null;
	};
	ticktick: {
		configured: boolean;
		connected: boolean;
		reminderEnabled: boolean;
		projectIdConfigured: boolean;
		timeOffProjectIdConfigured: boolean;
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
	calendar: {
		oauthConfigured: boolean;
		connected: boolean;
		timeOffCalendarConfigured: boolean;
	};
};

export async function getStatus(): Promise<AdminStatus> {
	const monthKey = spotifyService.currentMonthKey();
	const [spotifyRefresh, ticktickToken, reminderEnabled, playlistId, calendarRefresh] =
		await Promise.all([
			spotifyService.getRefreshToken(),
			ticktickService.getAccessToken(),
			ticktickService.isReminderEnabled(),
			redis.get<string>(`spotify:playlist:${monthKey}`),
			googleCalendarService.getRefreshToken(),
		]);

	const timeOffProjectConfigured =
		envConfigured('TICKTICK_TIME_OFF_PROJECT_ID') || envConfigured('TICKTICK_PROJECT_ID');

	return {
		spotify: {
			configured:
				envConfigured('SPOTIFY_CLIENT_ID') &&
				envConfigured('SPOTIFY_CLIENT_SECRET') &&
				envConfigured('SPOTIFY_REDIRECT_URI'),
			connected: Boolean(spotifyRefresh),
			monthKey,
			playlistName: spotifyService.monthDisplayName(monthKey),
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
			timeOffProjectIdConfigured: timeOffProjectConfigured,
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
		calendar: {
			oauthConfigured:
				envConfigured('GOOGLE_CLIENT_ID') &&
				envConfigured('GOOGLE_CLIENT_SECRET') &&
				envConfigured('GOOGLE_CALENDAR_REDIRECT_URI'),
			connected: Boolean(calendarRefresh),
			timeOffCalendarConfigured: envConfigured('GOOGLE_TIME_OFF_CALENDAR_ID'),
		},
	};
}
