import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import routes from '@/routes';

const spaIndex = path.join(process.cwd(), 'public/index.html');

export function createApp() {
	const app = express();

	app.use(requestLogger);
	app.use(cookieParser());

	// API + OAuth routes first so they are not swallowed by the SPA.
	app.use(routes);

	app.use(express.static(path.join(process.cwd(), 'public')));

	// React SPA client routes (home + photos).
	app.get(['/', '/photos'], (_req, res) => {
		res.sendFile(spaIndex);
	});

	app.use(errorHandler);

	return app;
}
