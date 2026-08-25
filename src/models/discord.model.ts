import { z } from 'zod';

export const DiscordChannelResponseSchema = z.object({
	id: z.string(),
});

export const DiscordMessageResponseSchema = z.object({
	id: z.string(),
});

export interface DiscordEmbed {
	title?: string;
	description?: string;
	url?: string;
	color?: number;
	fields?: { name: string; value: string; inline?: boolean }[];
}

export interface DiscordButton {
	type: 2; // BUTTON
	custom_id: string;
	label: string;
	style: number;
}

export interface DiscordActionRow {
	type: 1; // ACTION_ROW
	components: DiscordButton[];
}
