import { z } from 'zod';

export const ShiftSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
	start_time: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
	end_time: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
});
export type Shift = z.infer<typeof ShiftSchema>;

export const JsonArraySchema = z.array(z.unknown());

export const ParseScheduleBodySchema = z.object({
	employeeName: z.string().trim().catch(''),
	workplaceName: z.string().trim().catch(''),
});

export const AllowedImageTypeSchema = z.enum([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
]);
export type AllowedImageType = z.infer<typeof AllowedImageTypeSchema>;
