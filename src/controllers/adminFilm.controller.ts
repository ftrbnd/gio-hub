import { Request, Response } from 'express';
import {
	FilmReviewSession,
	FilmRotatePhotoBodySchema,
	OrientFolderBodySchema,
	RotateAngle,
} from '@/models/film.model';
import * as filmService from '@/services/film.service';

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

function sessionPayload(sessionId: string, session: FilmReviewSession) {
	const photo = session.photos[session.index];
	return {
		sessionId,
		folder: session.folder,
		index: session.index,
		total: session.photos.length,
		checked: session.checked,
		failed: session.failed,
		photo: photo
			? {
					publicId: photo.publicId,
					displayName: filmService.displayName(photo.publicId),
					secureUrl: photo.secureUrl,
				}
			: null,
	};
}

export async function listFolders(req: Request, res: Response) {
	try {
		const folders = await filmService.listFilmFolders();
		res.json({
			folders,
			defaultFolder: filmService.defaultFilmFolder(folders),
		});
	} catch (err) {
		console.error(`[${req.requestId}] failed to list film folders:`, err);
		res.status(502).json({ error: 'Failed to list Cloudinary folders' });
	}
}

export async function listPhotos(req: Request, res: Response) {
	const folder = typeof req.query.folder === 'string' ? req.query.folder.trim() : '';
	if (!folder) {
		return res.status(400).json({ error: 'Query parameter "folder" is required' });
	}

	const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

	try {
		const page = await filmService.listFolderPhotosPage(folder, { cursor });
		if (page.photos.length === 0 && page.total === 0) {
			return res.status(404).json({ error: 'No images found in that folder' });
		}
		res.json(page);
	} catch (err) {
		console.error(`[${req.requestId}] failed to list folder photos:`, err);
		res.status(502).json({ error: 'Failed to load photos' });
	}
}

export async function rotatePhoto(req: Request, res: Response) {
	const parsed = FilmRotatePhotoBodySchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({
			error: 'Body must include publicId, assetFolder, and angle (90, -90, or 180)',
		});
	}

	try {
		const photo = await filmService.rotatePhotoDirect(
			parsed.data.publicId,
			parsed.data.assetFolder,
			parsed.data.angle as RotateAngle,
		);
		res.json({ photo });
	} catch (err) {
		console.error(`[${req.requestId}] failed to rotate photo:`, err);
		res.status(502).json({ error: 'Failed to rotate photo' });
	}
}

export async function listSessions(req: Request, res: Response) {
	try {
		const sessions = await filmService.listReviewSessions();
		res.json({ sessions });
	} catch (err) {
		console.error(`[${req.requestId}] failed to list film sessions:`, err);
		res.status(500).json({ error: 'Failed to list film sessions' });
	}
}

export async function createSession(req: Request, res: Response) {
	const parsed = OrientFolderBodySchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: 'Body must include a non-empty "folder" string' });
	}

	try {
		const created = await filmService.createBrowseSession(parsed.data.folder);
		if (!created) {
			return res.status(404).json({ error: 'No images found in that folder' });
		}
		res.status(201).json(sessionPayload(created.sessionId, created.session));
	} catch (err) {
		console.error(`[${req.requestId}] failed to create film browse session:`, err);
		res.status(502).json({ error: 'Failed to open folder' });
	}
}

export async function getSession(req: Request, res: Response) {
	const sessionId = paramId(req);
	try {
		const session = await filmService.getReviewSession(sessionId);
		if (!session) {
			return res.status(404).json({ error: 'Session not found or expired' });
		}
		res.json(sessionPayload(sessionId, session));
	} catch (err) {
		console.error(`[${req.requestId}] failed to load film session:`, err);
		res.status(500).json({ error: 'Failed to load session' });
	}
}

export async function navigateSession(req: Request, res: Response) {
	const direction = req.body?.direction;
	if (direction !== 'prev' && direction !== 'next') {
		return res.status(400).json({ error: 'Body must include direction "prev" or "next"' });
	}

	try {
		const { sessionId, session } = await filmService.navigateReview(
			paramId(req),
			direction,
		);
		res.json(sessionPayload(sessionId, session));
	} catch (err) {
		if (err instanceof filmService.FilmReviewSessionExpiredError) {
			return res.status(404).json({ error: err.message });
		}
		console.error(`[${req.requestId}] film session nav failed:`, err);
		res.status(500).json({ error: 'Failed to navigate' });
	}
}

export async function rotateSession(req: Request, res: Response) {
	const angle = req.body?.angle;
	if (angle !== 90 && angle !== -90 && angle !== 180) {
		return res.status(400).json({ error: 'Body must include angle 90, -90, or 180' });
	}

	try {
		const { sessionId, session } = await filmService.applyReviewRotation(
			paramId(req),
			angle as RotateAngle,
		);
		res.json(sessionPayload(sessionId, session));
	} catch (err) {
		if (err instanceof filmService.FilmReviewSessionExpiredError) {
			return res.status(404).json({ error: err.message });
		}
		console.error(`[${req.requestId}] film session rotate failed:`, err);
		res.status(502).json({ error: 'Failed to rotate photo' });
	}
}
