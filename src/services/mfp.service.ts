/**
 * MyFitnessPal logging orchestration.
 * Jobs are queued for a local Mac worker that runs headed Chromium + Claude
 * browser use. Passwords stay encrypted in Redis (SESSION_SECRET) and are only
 * handed to the worker over an authenticated API — never to the admin SPA.
 * Automating MFP may violate their Terms of Service — use at your own risk.
 */
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	randomUUID,
} from 'node:crypto';
import { redis } from '@/config/redis';
import { requireEnv } from '@/lib/env';
import type { MfpJob, MfpJobStatus, MfpWorkerJobPatch } from '@/models/mfp.model';
import { MfpJobSchema } from '@/models/mfp.model';
import type { NutritionEntry, NutritionResult } from '@/models/nutrition.model';
import * as nutritionService from '@/services/nutrition.service';

const JOB_KEY_PREFIX = 'mfp:job:';
const JOB_QUEUE_KEY = 'mfp:job_queue';
const ACTIVE_JOB_KEY = 'mfp:active_job';
const CREDENTIALS_KEY = 'mfp:credentials';
const WORKER_KEY = 'mfp:worker';
/** Worker must heartbeat within this window to count as online. */
const WORKER_ONLINE_MS = 45_000;

type StoredCredentials = {
	email: string;
	passwordCipher: string;
	updatedAt: string;
};

type WorkerHeartbeat = {
	at: string;
	hostname?: string;
};

export type FoodPayload = {
	name: string;
	brand?: string | null;
	result: NutritionResult;
};

function nowIso(): string {
	return new Date().toISOString();
}

function jobKey(id: string): string {
	return `${JOB_KEY_PREFIX}${id}`;
}

export function mealSlotLabel(date = new Date()): string {
	const hour = date.getHours();
	if (hour >= 5 && hour < 11) return 'Breakfast';
	if (hour >= 11 && hour < 16) return 'Lunch';
	if (hour >= 16 && hour < 22) return 'Dinner';
	return 'Snacks';
}

function deriveKey(): Buffer {
	return createHash('sha256').update(requireEnv('SESSION_SECRET')).digest();
}

function encryptPassword(password: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(password, 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptPassword(passwordCipher: string): string {
	const parts = passwordCipher.split(':');
	if (parts.length !== 3) {
		throw new Error('Invalid stored password cipher');
	}
	const [ivB64, tagB64, dataB64] = parts;
	const decipher = createDecipheriv(
		'aes-256-gcm',
		deriveKey(),
		Buffer.from(ivB64, 'base64'),
	);
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	const plain = Buffer.concat([
		decipher.update(Buffer.from(dataB64, 'base64')),
		decipher.final(),
	]);
	return plain.toString('utf8');
}

export function maskEmail(email: string): string {
	const trimmed = email.trim();
	const at = trimmed.indexOf('@');
	if (at <= 0) return '***';
	const local = trimmed.slice(0, at);
	const domain = trimmed.slice(at + 1);
	const visible = local.slice(0, Math.min(2, local.length));
	return `${visible}***@${domain}`;
}

export async function saveCredentials(
	email: string,
	password: string,
): Promise<void> {
	const payload: StoredCredentials = {
		email: email.trim(),
		passwordCipher: encryptPassword(password),
		updatedAt: nowIso(),
	};
	await redis.set(CREDENTIALS_KEY, payload);
}

export async function getCredentials(): Promise<{
	email: string;
	password: string;
} | null> {
	const raw = await redis.get(CREDENTIALS_KEY);
	if (!raw || typeof raw !== 'object') return null;
	const stored = raw as Partial<StoredCredentials>;
	if (
		typeof stored.email !== 'string' ||
		typeof stored.passwordCipher !== 'string'
	) {
		return null;
	}
	return {
		email: stored.email,
		password: decryptPassword(stored.passwordCipher),
	};
}

export async function hasCredentials(): Promise<boolean> {
	const raw = await redis.get(CREDENTIALS_KEY);
	if (!raw || typeof raw !== 'object') return false;
	const stored = raw as Partial<StoredCredentials>;
	return (
		typeof stored.email === 'string' &&
		stored.email.length > 0 &&
		typeof stored.passwordCipher === 'string' &&
		stored.passwordCipher.length > 0
	);
}

async function saveJob(job: MfpJob): Promise<MfpJob> {
	const parsed = MfpJobSchema.parse({ ...job, updatedAt: nowIso() });
	await redis.set(jobKey(parsed.id), parsed, { ex: 60 * 60 * 24 });
	return parsed;
}

async function readJob(id: string): Promise<MfpJob | null> {
	const raw = await redis.get(jobKey(id));
	if (!raw) return null;
	const parsed = MfpJobSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

async function appendLog(job: MfpJob, line: string): Promise<MfpJob> {
	return saveJob({
		...job,
		logs: [
			...job.logs,
			`${new Date().toISOString().slice(11, 19)} ${line}`,
		].slice(-80),
	});
}

async function setActiveJobId(jobId: string): Promise<void> {
	await redis.set(ACTIVE_JOB_KEY, jobId, { ex: 60 * 60 });
}

async function clearActiveJobId(): Promise<void> {
	await redis.del(ACTIVE_JOB_KEY);
}

async function readActiveJobId(): Promise<string | null> {
	const raw = await redis.get(ACTIVE_JOB_KEY);
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function recordWorkerHeartbeat(hostname?: string): Promise<void> {
	const payload: WorkerHeartbeat = {
		at: nowIso(),
		...(hostname ? { hostname } : {}),
	};
	await redis.set(WORKER_KEY, payload, { ex: 120 });
}

export async function getWorkerStatus(): Promise<{
	online: boolean;
	lastSeenAt: string | null;
	hostname: string | null;
}> {
	const raw = await redis.get(WORKER_KEY);
	if (!raw || typeof raw !== 'object') {
		return { online: false, lastSeenAt: null, hostname: null };
	}
	const hb = raw as Partial<WorkerHeartbeat>;
	if (typeof hb.at !== 'string') {
		return { online: false, lastSeenAt: null, hostname: null };
	}
	const age = Date.now() - Date.parse(hb.at);
	const online = Number.isFinite(age) && age >= 0 && age <= WORKER_ONLINE_MS;
	return {
		online,
		lastSeenAt: hb.at,
		hostname: typeof hb.hostname === 'string' ? hb.hostname : null,
	};
}

export function foodsFromEntry(entry: NutritionEntry): FoodPayload[] {
	const brand = entry.restaurant?.trim() || null;
	const ready = (entry.items ?? []).filter((item) => item.result);
	if (ready.length > 0) {
		return ready.map((item) => {
			const result = item.result!;
			return {
				name:
					result.title?.trim() ||
					item.name.trim() ||
					entry.title?.trim() ||
					'Custom food',
				brand,
				result: {
					...result,
					title:
						result.title?.trim() ||
						item.name.trim() ||
						entry.title?.trim() ||
						'Custom food',
					sourcesExplanation: result.sourcesExplanation || 'Estimated',
				},
			};
		});
	}
	if (entry.result) {
		const result = entry.result;
		return [
			{
				name:
					result.title?.trim() ||
					entry.title?.trim() ||
					entry.query.trim() ||
					'Custom food',
				brand,
				result: {
					...result,
					title:
						result.title?.trim() ||
						entry.title?.trim() ||
						entry.query.trim() ||
						'Custom food',
					sourcesExplanation: result.sourcesExplanation || 'Estimated',
				},
			},
		];
	}
	return [];
}

export async function getSessionStatus(): Promise<{
	connected: boolean;
	emailMasked: string | null;
	workerOnline: boolean;
	workerHostname: string | null;
	workerLastSeenAt: string | null;
	browserBusy: boolean;
	activeJobId: string | null;
	activeEntryId: string | null;
	activeJobStatus: MfpJobStatus | null;
}> {
	const worker = await getWorkerStatus();
	const activeJobId = await readActiveJobId();
	const activeJob = activeJobId ? await readJob(activeJobId) : null;
	const jobInFlight =
		activeJob?.status === 'queued' ||
		activeJob?.status === 'running' ||
		activeJob?.status === 'needs_input';

	return {
		connected: worker.online,
		emailMasked: null,
		workerOnline: worker.online,
		workerHostname: worker.hostname,
		workerLastSeenAt: worker.lastSeenAt,
		browserBusy: Boolean(jobInFlight),
		activeJobId: jobInFlight ? activeJob!.id : null,
		activeEntryId: jobInFlight ? activeJob!.entryId : null,
		activeJobStatus: jobInFlight ? activeJob!.status : null,
	};
}

export async function disconnectSession(): Promise<void> {
	// Legacy: cleared stored email/password. Login is now Chrome-session based.
	await redis.del(CREDENTIALS_KEY);
	await cancelActiveJob();
}

export async function cancelActiveJob(): Promise<{
	ok: true;
	cancelledJobId: string | null;
}> {
	const activeJobId = await readActiveJobId();
	let cancelledJobId: string | null = null;
	if (activeJobId) {
		const job = await readJob(activeJobId);
		if (
			job &&
			(job.status === 'queued' ||
				job.status === 'running' ||
				job.status === 'needs_input')
		) {
			await saveJob({
				...job,
				status: 'error',
				errorMessage: 'Cancelled',
				logs: [
					...job.logs,
					`${new Date().toISOString().slice(11, 19)} Cancelled by user`,
				].slice(-80),
			});
			cancelledJobId = job.id;
		}
		await redis.lrem(JOB_QUEUE_KEY, 0, activeJobId);
	}
	await clearActiveJobId();
	return { ok: true, cancelledJobId };
}

export async function getJob(id: string): Promise<MfpJob | null> {
	return readJob(id);
}

export async function provideJobInput(
	jobId: string,
	input: { text?: string; resume?: boolean },
): Promise<MfpJob | null> {
	const job = await readJob(jobId);
	if (!job) return null;
	if (job.status !== 'needs_input') {
		throw new Error('Job is not waiting for input');
	}
	const next = await saveJob({
		...job,
		status: 'running',
		errorMessage: null,
	});
	return appendLog(
		next,
		input.text
			? `User note for Mac worker: ${input.text}`
			: 'Resumed after user action…',
	);
}

export async function startLogJob(entryId: string): Promise<
	| { ok: true; job: MfpJob }
	| { ok: false; workerOffline: true; error: string }
	| { ok: false; busy: true; error: string }
	| { ok: false; error: string }
> {
	const worker = await getWorkerStatus();
	if (!worker.online) {
		return {
			ok: false,
			workerOffline: true,
			error:
				'Your Mac isn’t available. Start the MFP worker on this machine, then try again.',
		};
	}

	const entry = await nutritionService.getEntry(entryId);
	if (!entry) return { ok: false, error: 'Entry not found' };
	const foods = foodsFromEntry(entry);
	if (foods.length === 0) {
		return { ok: false, error: 'Entry has no nutrition results to log' };
	}

	const activeId = await readActiveJobId();
	if (activeId) {
		const active = await readJob(activeId);
		if (
			active &&
			(active.status === 'queued' ||
				active.status === 'running' ||
				active.status === 'needs_input')
		) {
			return {
				ok: false,
				busy: true,
				error: 'A MyFitnessPal log job is already in progress',
			};
		}
	}

	const ts = nowIso();
	const job = await saveJob({
		id: randomUUID(),
		entryId,
		status: 'queued',
		logs: [`${ts.slice(11, 19)} Queued for Mac worker`],
		errorMessage: null,
		lastScreenshotBase64: null,
		createdAt: ts,
		updatedAt: ts,
	});
	await setActiveJobId(job.id);
	await redis.rpush(JOB_QUEUE_KEY, job.id);
	return { ok: true, job };
}

export async function claimNextJob(): Promise<{
	job: MfpJob;
	entryId: string;
	meal: string;
	foods: FoodPayload[];
} | null> {
	for (let i = 0; i < 20; i += 1) {
		const jobId = await redis.lpop<string>(JOB_QUEUE_KEY);
		if (!jobId) return null;

		const job = await readJob(jobId);
		if (!job) continue;
		if (job.status === 'error' || job.status === 'done') continue;
		if (job.status !== 'queued') {
			// Already claimed or running — skip
			continue;
		}

		const entry = await nutritionService.getEntry(job.entryId);
		if (!entry) {
			await saveJob({
				...job,
				status: 'error',
				errorMessage: 'Entry not found',
			});
			await clearActiveJobId();
			continue;
		}
		const foods = foodsFromEntry(entry);
		if (foods.length === 0) {
			await saveJob({
				...job,
				status: 'error',
				errorMessage: 'Entry has no nutrition results to log',
			});
			await clearActiveJobId();
			continue;
		}

		const running = await appendLog(
			await saveJob({ ...job, status: 'running', errorMessage: null }),
			'Claimed by Mac worker',
		);
		await setActiveJobId(running.id);

		return {
			job: running,
			entryId: running.entryId,
			meal: mealSlotLabel(),
			foods,
		};
	}
	return null;
}

export async function patchJobFromWorker(
	jobId: string,
	patch: MfpWorkerJobPatch,
): Promise<MfpJob | null> {
	const job = await readJob(jobId);
	if (!job) return null;

	let next: MfpJob = { ...job };
	if (patch.status) next = { ...next, status: patch.status };
	if (patch.errorMessage !== undefined) {
		next = { ...next, errorMessage: patch.errorMessage };
	}
	if (patch.lastScreenshotBase64 !== undefined) {
		next = {
			...next,
			lastScreenshotBase64: patch.lastScreenshotBase64,
		};
	}
	if (patch.appendLog) {
		next = {
			...next,
			logs: [
				...next.logs,
				`${new Date().toISOString().slice(11, 19)} ${patch.appendLog}`,
			].slice(-80),
		};
	}
	next = await saveJob(next);

	if (patch.markLogged && next.status === 'done') {
		await nutritionService.markMfpLogged(next.entryId, next.id);
	}

	if (next.status === 'done' || next.status === 'error') {
		const active = await readActiveJobId();
		if (active === next.id) await clearActiveJobId();
	}

	return next;
}
