import { Request, Response } from 'express';
import { InstagramComposerDraftSchema } from '@/models/instagram.model';
import * as instagramDraftService from '@/services/instagramDraft.service';

export async function getDraft(req: Request, res: Response) {
	try {
		const draft = await instagramDraftService.getComposerDraft();
		res.json({ draft });
	} catch (err) {
		console.error(`[${req.requestId}] failed to load Instagram draft:`, err);
		res.status(500).json({ error: 'Failed to load draft' });
	}
}

export async function saveDraft(req: Request, res: Response) {
	const parsed = InstagramComposerDraftSchema.safeParse(req.body?.draft ?? req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: 'Invalid Instagram composer draft' });
	}

	try {
		const draft = await instagramDraftService.saveComposerDraft(parsed.data);
		res.json({ draft });
	} catch (err) {
		console.error(`[${req.requestId}] failed to save Instagram draft:`, err);
		res.status(500).json({ error: 'Failed to save draft' });
	}
}

export async function clearDraft(req: Request, res: Response) {
	try {
		await instagramDraftService.clearComposerDraft();
		res.json({ ok: true });
	} catch (err) {
		console.error(`[${req.requestId}] failed to clear Instagram draft:`, err);
		res.status(500).json({ error: 'Failed to clear draft' });
	}
}
