import { z } from 'zod';

export const GoogleTokenResponseSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string().optional(),
	expires_in: z.number().optional(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
});

export const GoogleCalendarListEntrySchema = z.object({
	id: z.string(),
	summary: z.string(),
	primary: z.boolean().optional(),
});

export const GoogleCalendarListResponseSchema = z.object({
	items: z.array(GoogleCalendarListEntrySchema).optional(),
});

export const GoogleCalendarEventSchema = z.object({
	id: z.string(),
	summary: z.string().optional(),
	htmlLink: z.string().optional(),
	description: z.string().optional(),
	status: z.string().optional(),
	start: z.object({
		dateTime: z.string().optional(),
		date: z.string().optional(),
	}),
	end: z.object({
		dateTime: z.string().optional(),
		date: z.string().optional(),
	}),
});

export const GoogleCalendarEventsResponseSchema = z.object({
	items: z.array(GoogleCalendarEventSchema).optional(),
});

export type GoogleCalendarListEntry = z.infer<typeof GoogleCalendarListEntrySchema>;
export type GoogleCalendarEvent = z.infer<typeof GoogleCalendarEventSchema>;
