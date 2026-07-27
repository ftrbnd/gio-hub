import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/config/anthropic';
import {
	AllowedImageType,
	JsonArraySchema,
	Shift,
	ShiftSchema,
} from '@/models/shift.model';

export function buildPrompt(
	employeeName: string,
	workplaceName: string,
	todayISO: string,
): string {
	return `You are reading a photo of a work schedule for an employee at ${workplaceName || 'their workplace'}. The photo is either a screenshot from a scheduling app (usually showing only this employee's own shifts) or a photo of a printed weekly schedule posted at the workplace (which may list multiple employees in a grid, by day).

The employee's name as it appears on schedules is: "${employeeName || "(not provided — assume the image only shows one employee's own shifts)"}". Only include shifts that belong to this employee. Matching may be by first name only, first name + last initial, or full name, case-insensitive.

Today's date is ${todayISO}. Schedule dates are usually shown as just a month/day without a year — use today's date to resolve the correct year (the schedule is almost always for the current week or the next one, never more than a few months from today).

Respond with ONLY a JSON array, no prose, no markdown code fences. Each element must look like:
{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}
using 24-hour time. If a shift crosses midnight, still report the times as given (end_time may be numerically earlier than start_time). If you cannot find any shifts for this employee, or the image doesn't appear to be a schedule at all, respond with an empty array: []`;
}

export function parseImageWithClaude(
	imageBuffer: Buffer,
	mimetype: AllowedImageType,
	prompt: string,
): Promise<Anthropic.Message> {
	return anthropic.messages.create({
		model: 'claude-sonnet-5',
		max_tokens: 2048,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'image',
						source: {
							type: 'base64',
							media_type: mimetype,
							data: imageBuffer.toString('base64'),
						},
					},
					{
						type: 'text',
						text: prompt,
					},
				],
			},
		],
	});
}

export function extractJsonArray(text: string): unknown[] {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	const parsed = JSON.parse(candidate);
	return JsonArraySchema.parse(parsed);
}

export function isValidShift(shift: unknown): shift is Shift {
	return ShiftSchema.safeParse(shift).success;
}

// The model sometimes reports a shift's pre-lunch and post-lunch halves as two
// separate entries for the same date (e.g. a 30-minute lunch break). Merge
// same-date shifts into one, spanning the earliest start to the latest end.
export function mergeShiftsByDate(shifts: Shift[]): Shift[] {
	const byDate = new Map<string, Shift>();
	for (const shift of shifts) {
		const existing = byDate.get(shift.date);
		if (!existing) {
			byDate.set(shift.date, shift);
			continue;
		}
		byDate.set(shift.date, {
			date: shift.date,
			start_time:
				shift.start_time < existing.start_time
					? shift.start_time
					: existing.start_time,
			end_time:
				shift.end_time > existing.end_time ? shift.end_time : existing.end_time,
		});
	}
	return Array.from(byDate.values());
}
