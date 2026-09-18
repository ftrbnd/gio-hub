import { redis } from '@/config/redis';
import { requireEnv } from '@/lib/env';
import {
	GoogleCalendarEventsResponseSchema,
	GoogleCalendarListResponseSchema,
	GoogleCalendarEvent,
	GoogleCalendarListEntry,
	GoogleTokenResponseSchema,
} from '@/models/googleCalendar.model';
import * as discordService from '@/services/discord.service';
import {
	createAndStoreOAuthState as createOAuthState,
	verifyAndConsumeOAuthState as verifyOAuthState,
} from '@/services/oauthState.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const REFRESH_TOKEN_KEY = 'google_calendar:refresh_token';
/** Longer TTL so a Discord reauth DM from the daily cron is still usable later. */
const REAUTH_OAUTH_STATE_TTL_SECONDS = 60 * 60 * 24;

export class GoogleCalendarNotConnectedError extends Error {
	constructor() {
		super('Google Calendar is not connected yet — visit /calendar/login first');
	}
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: requireEnv('GOOGLE_CLIENT_ID'),
		redirect_uri: requireEnv('GOOGLE_CALENDAR_REDIRECT_URI'),
		response_type: 'code',
		scope: SCOPES,
		state,
		access_type: 'offline',
		prompt: 'consent',
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function createAndStoreOAuthState(ttlSeconds?: number): Promise<string> {
	return createOAuthState('google-calendar', ttlSeconds);
}

/** One-click Google OAuth URL for Discord (state valid for 24h). */
export async function createReauthAuthorizeUrl(): Promise<string> {
	const state = await createAndStoreOAuthState(REAUTH_OAUTH_STATE_TTL_SECONDS);
	return buildAuthorizeUrl(state);
}

/** Fire-and-forget Discord DM with a Google Calendar reconnect link. */
export function notifyReauthNeeded(requestId: string | undefined, context: string): void {
	createReauthAuthorizeUrl()
		.then((url) => discordService.notifyReauthDM(requestId, context, url))
		.catch((err) => {
			console.error(`[${requestId}] failed to build Google Calendar reauth link:`, err);
			discordService.notifyErrorDM(
				requestId,
				`${context} — reconnect needed but reauth link failed`,
				err,
			);
		});
}

export function verifyAndConsumeOAuthState(state: string): Promise<boolean> {
	return verifyOAuthState('google-calendar', state);
}

async function requestToken(
	body: URLSearchParams,
): Promise<{ accessToken: string; refreshToken?: string }> {
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});
	if (!res.ok) {
		throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
	}
	const json = GoogleTokenResponseSchema.parse(await res.json());
	return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export function exchangeCodeForTokens(code: string) {
	return requestToken(
		new URLSearchParams({
			code,
			client_id: requireEnv('GOOGLE_CLIENT_ID'),
			client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
			redirect_uri: requireEnv('GOOGLE_CALENDAR_REDIRECT_URI'),
			grant_type: 'authorization_code',
		}),
	);
}

export function refreshAccessToken(refreshToken: string) {
	return requestToken(
		new URLSearchParams({
			client_id: requireEnv('GOOGLE_CLIENT_ID'),
			client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		}),
	);
}

export async function storeRefreshToken(token: string): Promise<void> {
	await redis.set(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
	return (await redis.get<string>(REFRESH_TOKEN_KEY)) ?? null;
}

export async function clearRefreshToken(): Promise<void> {
	await redis.del(REFRESH_TOKEN_KEY);
}

async function getAccessToken(): Promise<string> {
	const storedRefreshToken = await getRefreshToken();
	if (!storedRefreshToken) throw new GoogleCalendarNotConnectedError();

	try {
		const { accessToken, refreshToken: rotatedRefreshToken } =
			await refreshAccessToken(storedRefreshToken);
		if (rotatedRefreshToken) await storeRefreshToken(rotatedRefreshToken);
		return accessToken;
	} catch {
		// Expired / revoked refresh tokens surface as generic token request
		// failures — treat them as disconnected so callers can offer reauth.
		await clearRefreshToken();
		throw new GoogleCalendarNotConnectedError();
	}
}

async function calendarFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const accessToken = await getAccessToken();
	const res = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (res.status === 401) throw new GoogleCalendarNotConnectedError();
	if (!res.ok) {
		throw new Error(
			`Google Calendar API request failed: ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`,
		);
	}
	return res.json() as Promise<T>;
}

export async function listCalendars(): Promise<GoogleCalendarListEntry[]> {
	const json = await calendarFetch<unknown>('/users/me/calendarList');
	return GoogleCalendarListResponseSchema.parse(json).items ?? [];
}

export async function listUpcomingEvents(
	calendarId: string,
	timeMin: Date,
	timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
	const params = new URLSearchParams({
		timeMin: timeMin.toISOString(),
		timeMax: timeMax.toISOString(),
		singleEvents: 'true',
		orderBy: 'startTime',
		maxResults: '250',
	});
	const encodedCalendarId = encodeURIComponent(calendarId);
	const json = await calendarFetch<unknown>(
		`/calendars/${encodedCalendarId}/events?${params.toString()}`,
	);
	return GoogleCalendarEventsResponseSchema.parse(json).items ?? [];
}

export function eventStartDate(event: GoogleCalendarEvent): Date {
	const raw = event.start.dateTime ?? event.start.date;
	if (!raw) return new Date(0);
	if (event.start.date) {
		return new Date(`${raw}T00:00:00`);
	}
	return new Date(raw);
}
