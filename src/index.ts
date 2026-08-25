import 'dotenv/config';
import { createApp } from './app';
import * as discordService from '@/services/discord.service';

// Node exits on an unhandled rejection by default anyway (since v15) — this
// just gets a DM out first. The process is in an unknown state after either
// of these, so we exit and let Render restart it rather than limp on.
function crashWithNotification(context: string, err: unknown) {
	console.error(`${context}:`, err);
	discordService
		.notifyError(context, err)
		.catch((notifyErr) => console.error('failed to send Discord crash DM:', notifyErr))
		.finally(() => process.exit(1));
}

process.on('uncaughtException', (err) => crashWithNotification('Uncaught exception — process crashing', err));
process.on('unhandledRejection', (reason) => crashWithNotification('Unhandled rejection — process crashing', reason));

const app = createApp();

const port = process.env.PORT || 3000;
app.listen(port, () => {
	console.log(`gio-hub server listening on port ${port}`);
});
