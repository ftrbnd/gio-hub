import { redis } from '@/config/redis';
import {
	InstagramComposerDraft,
	InstagramComposerDraftSchema,
} from '@/models/instagram.model';

const DRAFT_KEY = 'instagram:composer:draft';

export async function getComposerDraft(): Promise<InstagramComposerDraft | null> {
	const raw = await redis.get<unknown>(DRAFT_KEY);
	if (raw == null) return null;

	const parsed = InstagramComposerDraftSchema.safeParse(raw);
	if (!parsed.success) {
		console.warn('[instagram] ignoring invalid composer draft in Redis');
		return null;
	}
	return parsed.data;
}

export async function saveComposerDraft(
	draft: InstagramComposerDraft,
): Promise<InstagramComposerDraft> {
	const parsed = InstagramComposerDraftSchema.parse(draft);
	await redis.set(DRAFT_KEY, parsed);
	return parsed;
}

export async function clearComposerDraft(): Promise<void> {
	await redis.del(DRAFT_KEY);
}
