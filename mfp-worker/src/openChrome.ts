/**
 * Open a dedicated Google Chrome (real browser) with remote debugging for MFP.
 * Does not require quitting your everyday Chrome.
 *
 *   pnpm mfp-chrome
 *   → log into MyFitnessPal once in that window
 *   → pnpm mfp-worker
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
	CDP_PORT,
	CDP_URL,
	cdpReachable,
	chromeUserDataDir,
	launchSystemChrome,
	waitMs,
} from './chrome.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env') });
loadEnv();

async function main() {
	if (await cdpReachable()) {
		console.log(`[mfp-chrome] Already debugging at ${CDP_URL} — nothing to do.`);
		console.log(
			'[mfp-chrome] Log into MyFitnessPal in that Chrome window, then run pnpm mfp-worker.',
		);
		return;
	}

	console.log('[mfp-chrome] Starting a dedicated Chrome instance for MFP…');
	console.log(
		'[mfp-chrome] (Your normal Chrome can stay open; this uses .chrome-profile)',
	);
	launchSystemChrome({
		port: CDP_PORT,
		userDataDir: chromeUserDataDir(),
	});

	// Chrome can take a few seconds to bind the debug port.
	for (let i = 0; i < 60; i += 1) {
		await waitMs(500);
		if (await cdpReachable()) {
			console.log(`[mfp-chrome] Ready at ${CDP_URL}`);
			console.log(
				'[mfp-chrome] Log into MyFitnessPal in that window (once), then: pnpm mfp-worker',
			);
			return;
		}
	}

	console.error(
		`[mfp-chrome] Chrome did not open debugging on port ${CDP_PORT}.\n` +
			`Tried profile: ${chromeUserDataDir()}\n` +
			`If something else is using ${CDP_PORT}, set MFP_CDP_URL=http://127.0.0.1:9223 and retry.\n` +
			`Or manually run:\n` +
			`  open -na "Google Chrome" --args --remote-debugging-port=${CDP_PORT} --user-data-dir="${chromeUserDataDir()}"`,
	);
	process.exit(1);
}

void main();
