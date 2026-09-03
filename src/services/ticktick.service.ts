import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
import { redis } from '@/config/redis';
import { requireEnv } from '@/lib/env';
import { DiscordActionRow } from '@/models/discord.model';
import {
	TickTickProjectsResponseSchema,
	TickTickTaskDetailSchema,
	TickTickTaskResponseSchema,
	TickTickTokenResponseSchema,
} from '@/models/ticktick.model';
import {
	createAndStoreOAuthState as createOAuthState,
	verifyAndConsumeOAuthState as verifyOAuthState,
} from '@/services/oauthState.service';

const TICKTICK_API_BASE = 'https://api.ticktick.com/open/v1';
const SCOPES = 'tasks:write tasks:read';
export const TASK_STATUS_COMPLETED = 2;

const REMINDER_ENABLED_KEY = 'ticktick:reminder_enabled';
export const REMINDER_TOGGLE_CUSTOM_ID = 'toggle_ticktick_reminder';

export async function isReminderEnabled(): Promise<boolean> {
	const value = await redis.get<boolean>(REMINDER_ENABLED_KEY);
	return value ?? true;
}

export async function setReminderEnabled(enabled: boolean): Promise<void> {
	await redis.set(REMINDER_ENABLED_KEY, enabled);
}

export function reminderToggleButtonRow(enabled: boolean): DiscordActionRow {
	return {
		type: MessageComponentTypes.ACTION_ROW,
		components: [
			{
				type: MessageComponentTypes.BUTTON,
				custom_id: REMINDER_TOGGLE_CUSTOM_ID,
				label: enabled ? 'TickTick Reminder: On' : 'TickTick Reminder: Off',
				style: enabled ? ButtonStyleTypes.SUCCESS : ButtonStyleTypes.SECONDARY,
			},
		],
	};
}

export class TickTickNotConnectedError extends Error {
	constructor() {
		super('TickTick account is not connected yet — visit /ticktick/login first');
	}
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: requireEnv('TICKTICK_CLIENT_ID'),
		response_type: 'code',
		redirect_uri: requireEnv('TICKTICK_REDIRECT_URI'),
		scope: SCOPES,
		state,
	});
	return `https://ticktick.com/oauth/authorize?${params.toString()}`;
}

export function createAndStoreOAuthState(): Promise<string> {
	return createOAuthState('ticktick');
}

export function verifyAndConsumeOAuthState(state: string): Promise<boolean> {
	return verifyOAuthState('ticktick', state);
}

export async function exchangeCodeForToken(code: string): Promise<string> {
	const clientId = requireEnv('TICKTICK_CLIENT_ID');
	const clientSecret = requireEnv('TICKTICK_CLIENT_SECRET');
	const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

	const res = await fetch('https://ticktick.com/oauth/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth}`,
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			scope: SCOPES,
			redirect_uri: requireEnv('TICKTICK_REDIRECT_URI'),
		}),
	});
	if (!res.ok) {
		throw new Error(`TickTick token request failed: ${res.status} ${await res.text()}`);
	}
	const json = TickTickTokenResponseSchema.parse(await res.json());
	return json.access_token;
}

export async function storeAccessToken(token: string): Promise<void> {
	await redis.set('ticktick:access_token', token);
}

export async function getAccessToken(): Promise<string | null> {
	return (await redis.get<string>('ticktick:access_token')) ?? null;
}

async function ticktickFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const accessToken = await getAccessToken();
	if (!accessToken) throw new TickTickNotConnectedError();

	const res = await fetch(`${TICKTICK_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (res.status === 401) throw new TickTickNotConnectedError();
	if (!res.ok) {
		throw new Error(
			`TickTick API request failed: ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`,
		);
	}
	return res.json() as Promise<T>;
}

export async function listProjects() {
	const json = await ticktickFetch<unknown>('/project');
	return TickTickProjectsResponseSchema.parse(json);
}

function formatTickTickDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+0000`;
}

function timeOffProjectId(): string {
	return process.env.TICKTICK_TIME_OFF_PROJECT_ID?.trim() || requireEnv('TICKTICK_PROJECT_ID');
}

export async function createCheckPlaylistTask(playlistUrl: string): Promise<void> {
	const dueDate = new Date(Date.now() + 5 * 60 * 1000);
	const json = await ticktickFetch<unknown>('/task', {
		method: 'POST',
		body: JSON.stringify({
			title: 'Check monthly playlist',
			content: playlistUrl,
			projectId: requireEnv('TICKTICK_PROJECT_ID'),
			dueDate: formatTickTickDate(dueDate),
			timeZone: 'UTC',
			isAllDay: false,
			reminders: ['TRIGGER:PT0S'],
		}),
	});
	TickTickTaskResponseSchema.parse(json);
}

export async function createTimeOffReminderTask(input: {
	title: string;
	content: string;
	dueDate: Date;
}): Promise<{ taskId: string; projectId: string }> {
	const projectId = timeOffProjectId();
	const json = await ticktickFetch<unknown>('/task', {
		method: 'POST',
		body: JSON.stringify({
			title: input.title,
			content: input.content,
			projectId,
			dueDate: formatTickTickDate(input.dueDate),
			timeZone: 'UTC',
			isAllDay: true,
			reminders: ['TRIGGER:PT0S'],
		}),
	});
	const task = TickTickTaskResponseSchema.parse(json);
	return { taskId: task.id, projectId: task.projectId || projectId };
}

export async function getTask(projectId: string, taskId: string) {
	const json = await ticktickFetch<unknown>(
		`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
	);
	return TickTickTaskDetailSchema.parse(json);
}
