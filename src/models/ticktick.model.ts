import { z } from 'zod';

export const TickTickTokenResponseSchema = z.object({
	access_token: z.string(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
	expires_in: z.number().optional(),
});

export const TickTickProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const TickTickProjectsResponseSchema = z.array(TickTickProjectSchema);

export const TickTickTaskResponseSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	title: z.string(),
});
