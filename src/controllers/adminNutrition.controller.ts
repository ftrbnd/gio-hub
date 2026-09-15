import { Request, Response } from 'express';
import {
	AllowedNutritionImageTypeSchema,
	CreateNutritionEntryBodySchema,
	PatchNutritionEntryBodySchema,
} from '@/models/nutrition.model';
import * as nutritionService from '@/services/nutrition.service';

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

export async function listEntries(req: Request, res: Response) {
	try {
		const entries = await nutritionService.listEntries();
		res.json({ entries });
	} catch (err) {
		console.error(`[${req.requestId}] failed to list nutrition entries:`, err);
		res.status(500).json({ error: 'Failed to list nutrition entries' });
	}
}

export async function createEntry(req: Request, res: Response) {
	const parsed = CreateNutritionEntryBodySchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({ error: 'Invalid body' });
	}

	try {
		const entry = await nutritionService.createEntry(parsed.data.query ?? '');
		res.status(201).json({ entry });
	} catch (err) {
		console.error(`[${req.requestId}] failed to create nutrition entry:`, err);
		res.status(500).json({ error: 'Failed to create nutrition entry' });
	}
}

export async function patchEntry(req: Request, res: Response) {
	const parsed = PatchNutritionEntryBodySchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({
			error: 'Body must include query, description, and/or website',
		});
	}

	try {
		const entry = await nutritionService.updateEntry(paramId(req), {
			query: parsed.data.query,
			description:
				parsed.data.description === ''
					? null
					: parsed.data.description === undefined
						? undefined
						: parsed.data.description,
			website:
				parsed.data.website === ''
					? null
					: parsed.data.website === undefined
						? undefined
						: parsed.data.website,
		});
		if (!entry) {
			return res.status(404).json({ error: 'Entry not found' });
		}
		res.json({ entry });
	} catch (err) {
		console.error(`[${req.requestId}] failed to patch nutrition entry:`, err);
		res.status(500).json({ error: 'Failed to update nutrition entry' });
	}
}

export async function calculateEntry(req: Request, res: Response) {
	try {
		const entry = await nutritionService.calculateEntry(paramId(req));
		if (!entry) {
			return res.status(404).json({ error: 'Entry not found' });
		}
		res.json({ entry });
	} catch (err) {
		console.error(
			`[${req.requestId}] failed to calculate nutrition entry:`,
			err,
		);
		res.status(502).json({ error: 'Failed to calculate nutrition' });
	}
}

export async function uploadPhoto(req: Request, res: Response) {
	const files = Array.isArray(req.files)
		? req.files
		: req.file
			? [req.file]
			: [];
	if (files.length === 0) {
		return res.status(400).json({ error: 'At least one image file is required' });
	}

	const validated: Array<{
		buffer: Buffer;
		mimetype: (typeof AllowedNutritionImageTypeSchema)['_output'];
	}> = [];
	for (const file of files) {
		const type = AllowedNutritionImageTypeSchema.safeParse(file.mimetype);
		if (!type.success) {
			return res.status(400).json({
				error: 'Images must be jpeg, png, gif, or webp',
			});
		}
		validated.push({ buffer: file.buffer, mimetype: type.data });
	}

	try {
		const entry = await nutritionService.attachPhotos(paramId(req), validated);
		if (!entry) {
			return res.status(404).json({ error: 'Entry not found' });
		}
		res.json({ entry });
	} catch (err) {
		console.error(`[${req.requestId}] failed to upload nutrition photo:`, err);
		const message =
			err instanceof Error && err.message.includes('At most')
				? err.message
				: 'Failed to upload photo';
		res.status(502).json({ error: message });
	}
}

export async function deleteEntry(req: Request, res: Response) {
	try {
		const deleted = await nutritionService.deleteEntry(paramId(req));
		if (!deleted) {
			return res.status(404).json({ error: 'Entry not found' });
		}
		res.json({ ok: true });
	} catch (err) {
		console.error(`[${req.requestId}] failed to delete nutrition entry:`, err);
		res.status(500).json({ error: 'Failed to delete nutrition entry' });
	}
}
