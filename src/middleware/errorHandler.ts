import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';

// Multer errors (e.g. file too large) land here rather than crashing the process.
export function errorHandler(
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (err instanceof MulterError) {
		console.warn(`[${req.requestId}] multer error: ${err.message}`);
		return res.status(400).json({ error: err.message });
	}
	console.error(`[${req.requestId}] unexpected error:`, err);
	res.status(500).json({ error: 'Unexpected server error' });
}
