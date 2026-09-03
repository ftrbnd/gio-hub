import { redis } from '@/config/redis';
import { TimeOffEventRecord, TimeOffSyncResult } from '@/models/timeOff.model';
import * as googleCalendarService from '@/services/googleCalendar.service';
import * as ticktickService from '@/services/ticktick.service';

const TIME_OFF_EVENT_IDS_KEY = 'time_off:event_ids';
const WORK_SHIFT_PREFIX = 'Work —';

function timeOffEventKey(eventId: string): string {
	return `time_off:event:${eventId}`;
}

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function timeOffCalendarId(): string {
	const id = process.env.GOOGLE_TIME_OFF_CALENDAR_ID?.trim();
	if (!id) {
		throw new Error(
			'GOOGLE_TIME_OFF_CALENDAR_ID is not configured — list calendars at /calendar/calendars and set the env var',
		);
	}
	return id;
}

function formatEventDate(date: Date): string {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	}).format(date);
}

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function daysUntilEvent(eventStart: Date): number {
	const today = startOfDay(new Date());
	const event = startOfDay(eventStart);
	return Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function reminderDueDate(eventStart: Date): Date {
	const preferredLeadDays = envInt('TIME_OFF_REMINDER_LEAD_DAYS', 21);
	const daysUntil = daysUntilEvent(eventStart);

	if (daysUntil > preferredLeadDays) {
		const due = startOfDay(eventStart);
		due.setDate(due.getDate() - preferredLeadDays);
		return due;
	}

	// Within 3 weeks of the event (including the 2–3 week window) — due ASAP.
	return startOfDay(new Date());
}

function isWorkShift(title: string | undefined): boolean {
	return (title ?? '').startsWith(WORK_SHIFT_PREFIX);
}

type StoredTimeOffEvent = Omit<TimeOffEventRecord, 'status'> & {
	status: string;
	remindedAt?: string;
};

export async function getTimeOffEvent(eventId: string): Promise<TimeOffEventRecord | null> {
	const raw = await redis.get<StoredTimeOffEvent>(timeOffEventKey(eventId));
	if (!raw) return null;
	return normalizeTimeOffEvent(raw);
}

function normalizeTimeOffEvent(raw: StoredTimeOffEvent): TimeOffEventRecord {
	const status =
		raw.status === 'reminder_sent' || raw.status === 'reminder_created'
			? 'reminder_created'
			: 'completed';
	return {
		...raw,
		status,
		reminderCreatedAt: raw.reminderCreatedAt ?? raw.remindedAt,
		reminderDueDate:
			raw.reminderDueDate ??
			(status === 'reminder_created'
				? reminderDueDate(new Date(raw.start)).toISOString()
				: undefined),
	};
}

async function saveTimeOffEvent(record: TimeOffEventRecord): Promise<void> {
	await redis.set(timeOffEventKey(record.eventId), record);
	const startMs = new Date(record.start).getTime();
	await redis.zadd(TIME_OFF_EVENT_IDS_KEY, { score: startMs, member: record.eventId });
}

async function listStoredTimeOffEvents(): Promise<TimeOffEventRecord[]> {
	const eventIds = await redis.zrange<string[]>(TIME_OFF_EVENT_IDS_KEY, 0, -1);
	if (!eventIds || eventIds.length === 0) return [];

	const records = await Promise.all(eventIds.map((id) => getTimeOffEvent(id)));
	return records.filter((record): record is TimeOffEventRecord => record !== null);
}

export async function listTimeOffEvents(): Promise<TimeOffEventRecord[]> {
	await syncTickTickCompletions();
	return listStoredTimeOffEvents();
}

export async function markTimeOffCompleted(
	eventId: string,
): Promise<TimeOffEventRecord | null> {
	const existing = await getTimeOffEvent(eventId);
	if (!existing) return null;

	const updated: TimeOffEventRecord = {
		...existing,
		status: 'completed',
		completedAt: new Date().toISOString(),
	};
	await saveTimeOffEvent(updated);
	return updated;
}

async function syncTickTickCompletions(requestId?: string): Promise<number> {
	const events = await listStoredTimeOffEvents();
	let updated = 0;

	for (const event of events) {
		if (event.status !== 'reminder_created') continue;
		if (!event.ticktickTaskId || !event.ticktickProjectId) continue;

		try {
			const task = await ticktickService.getTask(
				event.ticktickProjectId,
				event.ticktickTaskId,
			);
			if (task.status !== ticktickService.TASK_STATUS_COMPLETED) continue;

			await saveTimeOffEvent({
				...event,
				status: 'completed',
				completedAt: task.completedTime ?? new Date().toISOString(),
			});
			updated += 1;
		} catch (err) {
			console.error(
				`[${requestId}] failed to check TickTick completion for ${event.eventId}:`,
				err,
			);
		}
	}

	return updated;
}

export async function runTimeOffSync(requestId?: string): Promise<TimeOffSyncResult> {
	const calendarId = timeOffCalendarId();
	const lookaheadDays = envInt('TIME_OFF_LOOKAHEAD_DAYS', 90);
	const now = new Date();
	const timeMax = new Date(now);
	timeMax.setDate(timeMax.getDate() + lookaheadDays);

	const events = await googleCalendarService.listUpcomingEvents(calendarId, now, timeMax);
	const result: TimeOffSyncResult = {
		scanned: events.length,
		remindersCreated: 0,
		completionsDetected: 0,
		skipped: 0,
		errors: [],
	};

	result.completionsDetected = await syncTickTickCompletions(requestId);

	for (const event of events) {
		if (event.status === 'cancelled') {
			result.skipped += 1;
			continue;
		}

		const title = event.summary ?? '(No title)';
		if (isWorkShift(title)) {
			result.skipped += 1;
			continue;
		}

		const start = googleCalendarService.eventStartDate(event);
		if (start < now) {
			result.skipped += 1;
			continue;
		}

		const existing = await getTimeOffEvent(event.id);
		if (existing) {
			result.skipped += 1;
			continue;
		}

		const endRaw = event.end.dateTime ?? event.end.date ?? start.toISOString();
		const formattedDate = formatEventDate(start);
		const taskTitle = `Request time off: ${title} — ${formattedDate}`;
		const taskContent = event.htmlLink ?? event.description ?? '';

		try {
			const dueDate = reminderDueDate(start);
			const { taskId, projectId } = await ticktickService.createTimeOffReminderTask({
				title: taskTitle,
				content: taskContent,
				dueDate,
			});

			await saveTimeOffEvent({
				eventId: event.id,
				title,
				start: start.toISOString(),
				end: endRaw,
				calendarId,
				status: 'reminder_created',
				ticktickTaskId: taskId,
				ticktickProjectId: projectId,
				reminderCreatedAt: new Date().toISOString(),
				reminderDueDate: dueDate.toISOString(),
			});
			result.remindersCreated += 1;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			result.errors.push(`${title}: ${message}`);
			console.error(
				`[${requestId}] failed to create time off reminder for ${event.id}:`,
				err,
			);
		}
	}

	return result;
}
