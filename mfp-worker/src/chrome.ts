/**
 * Browser attachment for the MFP worker.
 *
 * Preferred: real Google Chrome via CDP (captcha works like a normal browser).
 * Uses a dedicated Chrome profile (mfp-worker/.chrome-profile) so you do NOT
 * need to quit your everyday Chrome.
 *
 *   1. pnpm mfp-chrome          # opens Chrome with remote debugging
 *   2. Log into MyFitnessPal    # once; session persists in .chrome-profile
 *   3. pnpm mfp-worker
 *
 * Fallback: Playwright .mfp-profile if MFP_ALLOW_PLAYWRIGHT_PROFILE=1.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	chromium,
	type Browser,
	type BrowserContext,
	type Page,
} from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));

export const CDP_URL = (process.env.MFP_CDP_URL || 'http://127.0.0.1:9222').replace(
	/\/$/,
	'',
);
export const CDP_PORT = Number(new URL(CDP_URL).port || 9222);

/** Dedicated profile — avoids SingletonLock fights with your main Chrome. */
export function chromeUserDataDir(): string {
	if (process.env.MFP_CHROME_USER_DATA_DIR) {
		return process.env.MFP_CHROME_USER_DATA_DIR;
	}
	return join(here, '../.chrome-profile');
}

export function chromeAppName(): string {
	if (process.env.MFP_CHROME_APP) return process.env.MFP_CHROME_APP;
	if (existsSync('/Applications/Google Chrome.app')) return 'Google Chrome';
	if (existsSync('/Applications/Google Chrome Beta.app')) {
		return 'Google Chrome Beta';
	}
	return 'Google Chrome';
}

export function chromeExecutable(): string {
	if (process.env.MFP_CHROME_PATH) return process.env.MFP_CHROME_PATH;
	const name = chromeAppName();
	const mac = `/Applications/${name}.app/Contents/MacOS/${name}`;
	if (existsSync(mac)) return mac;
	return 'google-chrome';
}

export async function waitMs(ms: number) {
	await new Promise((r) => setTimeout(r, ms));
}

export async function cdpReachable(url = CDP_URL): Promise<boolean> {
	const candidates = [
		url,
		url.replace('127.0.0.1', 'localhost'),
		url.replace('localhost', '127.0.0.1'),
	];
	for (const candidate of [...new Set(candidates)]) {
		try {
			const res = await fetch(`${candidate}/json/version`, {
				signal: AbortSignal.timeout(1_500),
			});
			if (res.ok) return true;
		} catch {
			/* try next */
		}
	}
	return false;
}

/**
 * Launch a separate Chrome instance with remote debugging.
 * On macOS, uses `open -na` which reliably starts a second Chrome.
 */
export function launchSystemChrome(opts?: {
	userDataDir?: string;
	port?: number;
}): void {
	const port = opts?.port ?? CDP_PORT;
	const userDataDir = opts?.userDataDir ?? chromeUserDataDir();
	mkdirSync(userDataDir, { recursive: true });

	const chromeArgs = [
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${userDataDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-features=ChromeWhatsNewUI',
		'https://www.myfitnesspal.com/food/diary',
	];

	console.log(`[mfp-chrome] user-data-dir=${userDataDir}`);
	console.log(`[mfp-chrome] debugging port=${port}`);

	if (process.platform === 'darwin') {
		const app = chromeAppName();
		console.log(`[mfp-chrome] open -na "${app}"`);
		const child = spawn(
			'open',
			['-na', app, '--args', ...chromeArgs],
			{ detached: true, stdio: 'ignore' },
		);
		child.unref();
		return;
	}

	const exe = chromeExecutable();
	console.log(`[mfp-chrome] ${exe}`);
	const child = spawn(exe, chromeArgs, {
		detached: true,
		stdio: 'ignore',
	});
	child.unref();
}

export type OpenedBrowser = {
	mode: 'cdp' | 'profile';
	browser: Browser | null;
	context: BrowserContext;
	page: Page;
	/** Disconnect (CDP) or close Playwright browser — never force-quit system Chrome. */
	dispose: () => Promise<void>;
};

export async function openMfpBrowser(profileDir: string): Promise<OpenedBrowser> {
	if (await cdpReachable(CDP_URL)) {
		// noDefaults: skip Browser.setDownloadBehavior — required for attaching
		// to a user-launched Chrome (otherwise CDP connect fails).
		const browser = await chromium.connectOverCDP(CDP_URL, {
			noDefaults: true,
		});
		const context = browser.contexts()[0];
		if (!context) {
			await browser.close().catch(() => undefined);
			throw new Error(
				'Connected to Chrome over CDP but found no browser context. Open a tab in the debug Chrome and retry.',
			);
		}
		const existing =
			context.pages().find((p) => /myfitnesspal\.com/i.test(p.url())) ||
			context.pages()[0];
		const page = existing || (await context.newPage());
		return {
			mode: 'cdp',
			browser,
			context,
			page,
			dispose: async () => {
				await browser.close().catch(() => undefined);
			},
		};
	}

	const allowProfile = process.env.MFP_ALLOW_PLAYWRIGHT_PROFILE === '1';
	if (!allowProfile) {
		throw new Error(
			`Cannot reach Chrome DevTools at ${CDP_URL}.\n` +
				`1. Run: pnpm mfp-chrome\n` +
				`2. Log into MyFitnessPal in the Chrome window that opens\n` +
				`3. Re-run the worker\n` +
				`(Your everyday Chrome can stay open — this uses .chrome-profile.)`,
		);
	}

	const context = await chromium.launchPersistentContext(profileDir, {
		channel: 'chrome',
		headless: false,
		viewport: { width: 1280, height: 800 },
		args: ['--disable-blink-features=AutomationControlled'],
	});
	const page = context.pages()[0] || (await context.newPage());
	return {
		mode: 'profile',
		browser: null,
		context,
		page,
		dispose: async () => {
			await context.close().catch(() => undefined);
		},
	};
}
