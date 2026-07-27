import express from 'express';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import routes from '@/routes';

export function createApp() {
	const app = express();

	app.use(requestLogger);
	app.use(routes);
	app.use(errorHandler);

	return app;
}
