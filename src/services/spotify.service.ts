import { redis } from '@/config/redis';
import { requireEnv } from '@/lib/env';
import {
	SpotifyCreatePlaylistResponseSchema,
	SpotifyTokenResponseSchema,
	SpotifyTopTracksResponseSchema,
	SpotifyTrack,
	SyncResult,
} from '@/models/spotify.model';
import {
	createAndStoreOAuthState as createOAuthState,
	verifyAndConsumeOAuthState as verifyOAuthState,
} from '@/services/oauthState.service';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SCOPES = 'user-top-read playlist-modify-public';
const TOP_TRACKS_LIMIT = 3;

export class SpotifyNotConnectedError extends Error {
	constructor() {
		super('Spotify account is not connected yet — visit /spotify/login first');
	}
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: requireEnv('SPOTIFY_CLIENT_ID'),
		response_type: 'code',
		redirect_uri: requireEnv('SPOTIFY_REDIRECT_URI'),
		scope: SCOPES,
		state,
	});
	return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function createAndStoreOAuthState(): Promise<string> {
	return createOAuthState('spotify');
}

export function verifyAndConsumeOAuthState(state: string): Promise<boolean> {
	return verifyOAuthState('spotify', state);
}

async function requestToken(
	body: URLSearchParams,
): Promise<{ accessToken: string; refreshToken?: string }> {
	const clientId = requireEnv('SPOTIFY_CLIENT_ID');
	const clientSecret = requireEnv('SPOTIFY_CLIENT_SECRET');
	const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth}`,
		},
		body,
	});
	if (!res.ok) {
		throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
	}
	const json = SpotifyTokenResponseSchema.parse(await res.json());
	return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export function exchangeCodeForTokens(code: string) {
	return requestToken(
		new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: requireEnv('SPOTIFY_REDIRECT_URI'),
		}),
	);
}

export function refreshAccessToken(refreshToken: string) {
	return requestToken(
		new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
		}),
	);
}

export async function storeRefreshToken(token: string): Promise<void> {
	await redis.set('spotify:refresh_token', token);
}

export async function getRefreshToken(): Promise<string | null> {
	return (await redis.get<string>('spotify:refresh_token')) ?? null;
}

async function spotifyFetch<T>(
	accessToken: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (!res.ok) {
		throw new Error(
			`Spotify API request failed: ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`,
		);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export async function getTopTracks(
	accessToken: string,
	limit = TOP_TRACKS_LIMIT,
): Promise<SpotifyTrack[]> {
	const json = await spotifyFetch<unknown>(
		accessToken,
		`/me/top/tracks?time_range=short_term&limit=${limit}`,
	);
	return SpotifyTopTracksResponseSchema.parse(json).items;
}

export function currentMonthKey(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// "MMM(M) 'YY" — the first 3 letters of the month, capitalized, except
// 4-letter months (June, July) spell out in full since abbreviating them
// saves nothing. E.g. "Jan '26", "May '26", "June '26", "Sep '26".
export function monthDisplayName(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	const fullMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
		new Date(year, month - 1, 1),
	);
	const abbreviation =
		fullMonthName.length <= 4 ? fullMonthName : fullMonthName.slice(0, 3);
	const shortYear = String(year).slice(-2);
	return `${abbreviation} '${shortYear}`;
}

export async function getOrCreateMonthlyPlaylist(
	monthKey: string,
	accessToken: string,
): Promise<string> {
	const key = `spotify:playlist:${monthKey}`;
	const existing = await redis.get<string>(key);
	if (existing) return existing;

	const json = await spotifyFetch<unknown>(accessToken, '/me/playlists', {
		method: 'POST',
		body: JSON.stringify({
			name: monthDisplayName(monthKey),
			public: true,
		}),
	});
	const playlistId = SpotifyCreatePlaylistResponseSchema.parse(json).id;
	await redis.set(key, playlistId);
	return playlistId;
}

export async function getAddedTrackUris(monthKey: string): Promise<Set<string>> {
	const members = await redis.smembers(`spotify:added:${monthKey}`);
	return new Set(members);
}

export async function markTracksAdded(monthKey: string, uris: string[]): Promise<void> {
	if (uris.length === 0) return;
	const [first, ...rest] = uris;
	await redis.sadd(`spotify:added:${monthKey}`, first, ...rest);
}

export async function addTracksToPlaylist(
	accessToken: string,
	playlistId: string,
	uris: string[],
): Promise<void> {
	if (uris.length === 0) return;
	await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
		method: 'POST',
		body: JSON.stringify({ uris }),
	});
}

export function playlistUrl(playlistId: string): string {
	return `https://open.spotify.com/playlist/${playlistId}`;
}

function trackLabel(track: SpotifyTrack): string {
	return `${track.name} — ${track.artists.map((artist) => artist.name).join(', ')}`;
}

export async function runWeeklySync(): Promise<SyncResult> {
	const storedRefreshToken = await getRefreshToken();
	if (!storedRefreshToken) throw new SpotifyNotConnectedError();

	const { accessToken, refreshToken: rotatedRefreshToken } =
		await refreshAccessToken(storedRefreshToken);
	if (rotatedRefreshToken) await storeRefreshToken(rotatedRefreshToken);

	const topTracks = await getTopTracks(accessToken);

	const monthKey = currentMonthKey();
	const playlistId = await getOrCreateMonthlyPlaylist(monthKey, accessToken);
	const alreadyAdded = await getAddedTrackUris(monthKey);

	const newTracks = topTracks.filter((track) => !alreadyAdded.has(track.uri));
	const alreadyPresentTracks = topTracks.filter((track) => alreadyAdded.has(track.uri));

	await addTracksToPlaylist(
		accessToken,
		playlistId,
		newTracks.map((track) => track.uri),
	);
	await markTracksAdded(
		monthKey,
		newTracks.map((track) => track.uri),
	);

	return {
		month: monthKey,
		playlistId,
		added: newTracks.map(trackLabel),
		alreadyPresent: alreadyPresentTracks.map(trackLabel),
	};
}
