import { Request, Response } from 'express';
import {
	AllowedImageTypeSchema,
	ParseScheduleBodySchema,
} from '@/models/shift.model';
import * as discordService from '@/services/discord.service';
import * as scheduleService from '@/services/schedule.service';

export async function parseSchedule(
	req: Request<Record<string, never>, unknown, unknown>,
	res: Response,
) {
	if (!req.file) {
		console.warn(`[${req.requestId}] no 'image' file present in form data`);
		return res.status(400).json({ error: "Missing 'image' file in form data" });
	}
	console.log(
		`[${req.requestId}] received file: ${req.file.originalname || '(unnamed)'}, ${req.file.mimetype}, ${req.file.size} bytes`,
	);
	const mimetypeResult = AllowedImageTypeSchema.safeParse(req.file.mimetype);
	if (!mimetypeResult.success) {
		console.warn(
			`[${req.requestId}] rejected file with unsupported mimetype: ${req.file.mimetype}`,
		);
		return res
			.status(400)
			.json({ error: 'Uploaded file must be a JPEG, PNG, GIF, or WEBP image' });
	}
	const mimetype = mimetypeResult.data;

	const { employeeName, workplaceName } = ParseScheduleBodySchema.parse(
		req.body,
	);
	const todayISO = new Date().toISOString().slice(0, 10);
	console.log(
		`[${req.requestId}] employeeName="${employeeName}", workplaceName="${workplaceName}", todayISO=${todayISO}`,
	);

	const prompt = scheduleService.buildPrompt(
		employeeName,
		workplaceName,
		todayISO,
	);

	let message;
	try {
		message = await scheduleService.parseImageWithClaude(
			req.file.buffer,
			mimetype,
			prompt,
		);
	} catch (err) {
		console.error(`[${req.requestId}] Claude API call failed:`, err);
		discordService.notifyErrorDM(req.requestId, 'Claude API call failed', err);
		return res.status(502).json({ error: 'Failed to reach the parsing model' });
	}

	const textBlock = message.content.find((block) => block.type === 'text');
	if (!textBlock) {
		console.error(`[${req.requestId}] Claude returned no text content block`);
		discordService.notifyErrorDM(req.requestId, 'Claude returned no text content block');
		return res.status(502).json({ error: 'Model returned no text content' });
	}
	console.log(`[${req.requestId}] Claude response text: ${textBlock.text}`);

	let shifts: unknown[];
	try {
		shifts = scheduleService.extractJsonArray(textBlock.text);
	} catch (err) {
		console.error(
			`[${req.requestId}] failed to parse model output as JSON:`,
			textBlock.text,
		);
		discordService.notifyErrorDM(req.requestId, 'failed to parse model output as JSON', err);
		return res.status(502).json({ error: 'Model response was not valid JSON' });
	}

	const validShifts = scheduleService.mergeShiftsByDate(
		shifts.filter(scheduleService.isValidShift),
	);
	console.log(
		`[${req.requestId}] sending ${validShifts.length} valid shift(s) (${shifts.length} total from model): ${JSON.stringify(validShifts)}`,
	);
	res.json(validShifts);
}
