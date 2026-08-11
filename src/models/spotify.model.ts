import { z } from 'zod';

export const SpotifyTrackSchema = z.object({
	id: z.string(),
	uri: z.string(),
	name: z.string(),
	artists: z.array(z.object({ name: z.string() })),
});
export type SpotifyTrack = z.infer<typeof SpotifyTrackSchema>;

export const SpotifyTopTracksResponseSchema = z.object({
	items: z.array(SpotifyTrackSchema),
});

export const SpotifyTokenResponseSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	expires_in: z.number(),
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
});

export const SpotifyCreatePlaylistResponseSchema = z.object({
	id: z.string(),
});

export const SyncResultSchema = z.object({
	month: z.string(),
	playlistId: z.string(),
	added: z.array(z.string()),
	alreadyPresent: z.array(z.string()),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;
