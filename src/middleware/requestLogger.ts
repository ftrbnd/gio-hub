import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

// Logs every request/response pair, and flags connections the client dropped
// before a response went out — the key signal for "network connection was
// lost" style errors reported by the iOS Shortcut.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
	req.requestId = crypto.randomUUID().slice(0, 8);
	const start = Date.now();
	console.log(
		`[${req.requestId}] <- ${req.method} ${req.originalUrl} (content-length: ${req.get('content-length') || 'unknown'}, content-type: ${req.get('content-type') || 'unknown'})`,
	);

	res.on('finish', () => {
		console.log(
			`[${req.requestId}] -> ${res.statusCode} in ${Date.now() - start}ms`,
		);
	});
	req.on('close', () => {
		if (!res.writableEnded) {
			console.warn(
				`[${req.requestId}] client closed the connection before a response was sent (${Date.now() - start}ms elapsed)`,
			);
		}
	});

	next();
}
