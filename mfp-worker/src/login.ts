/**
 * Verify / wait for a MyFitnessPal session in your real Chrome (CDP).
 * Run: pnpm mfp-login
 *
 * Prefer: pnpm mfp-chrome  → log in normally → pnpm mfp-login (optional check)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { openMfpBrowser, waitMs } from './chrome.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env') });
loadEnv();

const PROFILE_DIR = join(here, '../.mfp-profile');
const TIMEOUT_MS = 15 * 60 * 1000;

async function onLoginPage(page: import('playwright').Page): Promise<boolean> {
	const url = page.url().toLowerCase();
	if (url.includes('/account/login') || url.includes('/auth/signin')) return true;
	const password = page.locator('input[type="password"]').first();
	if (
		(await password.count()) > 0 &&
		(await password.isVisible().catch(() => false))
	) {
		return true;
	}
	return false;
}

async function main() {
	console.log('[mfp-login] Attaching to Chrome (CDP) or Playwright profile…');
	const opened = await openMfpBrowser(PROFILE_DIR);
	console.log(`[mfp-login] mode=${opened.mode}`);
	const { page } = opened;

	await page.goto('https://www.myfitnesspal.com/food/diary', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	});

	if (!(await onLoginPage(page))) {
		console.log('[mfp-login] Already signed in. Worker can use this Chrome session.');
		await opened.dispose();
		process.exit(0);
	}

	console.log(
		'[mfp-login] Not signed in — log into MyFitnessPal in Chrome (normal captcha is fine).',
	);
	await page.goto('https://www.myfitnesspal.com/account/login', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	});

	const deadline = Date.now() + TIMEOUT_MS;
	while (Date.now() < deadline) {
		await waitMs(2_000);
		if (await onLoginPage(page)) continue;
		await page.goto('https://www.myfitnesspal.com/food/diary', {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		});
		await waitMs(1_500);
		if (!(await onLoginPage(page))) {
			console.log('[mfp-login] Session OK. Keep this Chrome open and run the worker.');
			await opened.dispose();
			process.exit(0);
		}
	}

	console.error('[mfp-login] Timed out before a logged-in session was detected.');
	await opened.dispose();
	process.exit(1);
}

void main();
