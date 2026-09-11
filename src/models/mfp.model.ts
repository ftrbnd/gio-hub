import { z } from 'zod';

export const MfpJobStatusSchema = z.enum([
	'queued',
	'running',
	'needs_input',
	'done',
	'error',
]);
export type MfpJobStatus = z.infer<typeof MfpJobStatusSchema>;

export const MfpJobSchema = z.object({
	id: z.string().min(1),
	entryId: z.string().min(1),
	status: MfpJobStatusSchema,
	logs: z.array(z.string()).default([]),
	errorMessage: z.string().nullable().optional(),
	lastScreenshotBase64: z.string().nullable().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});
export type MfpJob = z.infer<typeof MfpJobSchema>;

export const MfpCredentialsBodySchema = z.object({
	email: z.string().email().min(3),
	password: z.string().min(1),
});
export type MfpCredentialsBody = z.infer<typeof MfpCredentialsBodySchema>;

/** Phone-side job input is no longer used for remote Playwright; kept for cancel/resume. */
export const MfpJobInputBodySchema = z
	.object({
		text: z.string().min(1).optional(),
		resume: z.boolean().optional(),
	})
	.refine((body) => Boolean(body.text || body.resume), {
		message: 'text or resume is required',
	});
export type MfpJobInputBody = z.infer<typeof MfpJobInputBodySchema>;

export const MfpWorkerJobPatchSchema = z.object({
	status: MfpJobStatusSchema.optional(),
	errorMessage: z.string().nullable().optional(),
	lastScreenshotBase64: z.string().nullable().optional(),
	appendLog: z.string().min(1).optional(),
	markLogged: z.boolean().optional(),
});
export type MfpWorkerJobPatch = z.infer<typeof MfpWorkerJobPatchSchema>;
