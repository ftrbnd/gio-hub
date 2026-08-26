import { Request, Response } from 'express';
import { OrientFolderBodySchema } from '@/models/film.model';
import * as discordService from '@/services/discord.service';
import * as filmService from '@/services/film.service';

export async function orientFolder(req: Request, res: Response) {
	const parsed = OrientFolderBodySchema.safeParse(req.body);
	if (!parsed.success) {
		console.warn(`[${req.requestId}] /film/orient missing or invalid folder`);
		return res.status(400).json({ error: 'Body must include a non-empty "folder" string' });
	}

	const { folder } = parsed.data;
	console.log(`[${req.requestId}] /film/orient accepted for folder="${folder}"`);

	// Long-running (Claude per photo). Accept immediately so film-sync / Render
	// don't time out; finish + Discord in the background.
	res.status(202).json({ accepted: true, folder });

	try {
		const result = await filmService.orientFolder(folder);
		console.log(
			`[${req.requestId}] /film/orient done for "${folder}": checked=${result.checked} rotated=${result.rotated} failed=${result.failed}`,
		);

		const review = await filmService.createReviewSession(result);

		try {
			if (review) {
				const payload = filmService.reviewMessagePayload(
					review.sessionId,
					review.session,
				);
				await discordService.sendEmbed(payload.embeds[0], payload.components);
			} else {
				const changed = result.results.filter(
					(r) => r.rotated || r.padded,
				).length;
				const photoWord = changed === 1 ? 'photo' : 'photos';
				await discordService.sendDirectMessage(
					`Updated **${changed}** ${photoWord} in \`${folder}\` (${result.checked} checked, ${result.rotated} rotated).`,
				);
			}
		} catch (err) {
			console.error(
				`[${req.requestId}] failed to send film orientation Discord summary:`,
				err,
			);
		}
	} catch (err) {
		console.error(`[${req.requestId}] /film/orient failed for "${folder}":`, err);
		discordService.notifyErrorDM(req.requestId, `/film/orient failed for ${folder}`, err);
	}
}
