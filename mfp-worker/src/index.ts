/**
 * Local Mac MFP worker: heartbeats to gio-hub, claims queued jobs, drives the
 * browser with Claude browser use.
 *
 * Preferred session: real Google Chrome via CDP (captcha works).
 *   1. pnpm mfp-chrome
 *   2. Log into MyFitnessPal in that window (once)
 *   3. pnpm mfp-worker
 * Uses mfp-worker/.chrome-profile — your everyday Chrome can stay open.
 *
 * Env:
 *   GIO_HUB_URL      default http://localhost:3000
 *   API_SECRET
 *   ANTHROPIC_API_KEY
 *   MFP_CDP_URL      default http://127.0.0.1:9222
 *   MFP_ALLOW_PLAYWRIGHT_PROFILE=1  fallback to .mfp-profile
 */
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { type Page } from 'playwright';
import { CDP_URL, openMfpBrowser } from './chrome.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env') });
loadEnv();

const HUB_URL = (process.env.GIO_HUB_URL || 'http://localhost:3000').replace(
	/\/$/,
	'',
);
const API_SECRET = process.env.API_SECRET || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const POLL_MS = 3_000;
const HEARTBEAT_MS = 15_000;
const PROFILE_DIR = join(here, '../.mfp-profile');

if (!API_SECRET || !ANTHROPIC_API_KEY) {
	console.error('Missing API_SECRET or ANTHROPIC_API_KEY in environment.');
	process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type FoodPayload = {
	name: string;
	brand?: string | null;
	result: Record<string, unknown>;
};

type ClaimedJob = {
	job: { id: string; entryId: string; status: string };
	entryId: string;
	meal: string;
	foods: FoodPayload[];
};

async function hubFetch(path: string, init: RequestInit = {}) {
	const res = await fetch(`${HUB_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${API_SECRET}`,
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers,
		},
	});
	return res;
}

async function heartbeat() {
	await hubFetch('/api/mfp/worker/heartbeat', {
		method: 'POST',
		body: JSON.stringify({ hostname: hostname() }),
	});
}

async function claimNext(): Promise<ClaimedJob | null> {
	const res = await hubFetch('/api/mfp/worker/jobs/next');
	if (res.status === 204) return null;
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`claim failed: ${res.status} ${text}`);
	}
	return (await res.json()) as ClaimedJob;
}

async function patchJob(
	jobId: string,
	body: {
		status?: string;
		errorMessage?: string | null;
		lastScreenshotBase64?: string | null;
		appendLog?: string;
		markLogged?: boolean;
	},
) {
	const res = await hubFetch(`/api/mfp/worker/jobs/${encodeURIComponent(jobId)}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`patch failed: ${res.status} ${text}`);
	}
	return res.json();
}

type RefMap = Map<string, string>;

/** Keep under Anthropic's 2576px / token limits; consistent size for click coords. */
const ANTHROPIC_SHOT_MAX_SIDE = 1280;

type ShotPayload = {
	base64: string;
	mediaType: 'image/jpeg';
	/** CSS viewport px / image px — multiply Claude coords by this before clicking. */
	scaleToViewport: number;
	width: number;
	height: number;
};

let lastShotScaleToViewport = 1;

async function downscaleImageBuffer(
	raw: Buffer,
	maxSide = ANTHROPIC_SHOT_MAX_SIDE,
	quality = 50,
): Promise<{ buffer: Buffer; width: number; height: number; scale: number }> {
	const meta = await sharp(raw).metadata();
	const srcW = meta.width || maxSide;
	const srcH = meta.height || maxSide;
	const longSide = Math.max(srcW, srcH);
	const scale = longSide > maxSide ? longSide / maxSide : 1;
	const out = await sharp(raw)
		.resize({
			width: maxSide,
			height: maxSide,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.jpeg({ quality, mozjpeg: true })
		.toBuffer();
	const outMeta = await sharp(out).metadata();
	const width = outMeta.width || Math.round(srcW / scale);
	const height = outMeta.height || Math.round(srcH / scale);
	if (Math.max(width, height) > maxSide) {
		throw new Error(
			`Screenshot still too large after resize: ${width}x${height}`,
		);
	}
	return { buffer: out, width, height, scale };
}

async function captureScreenshot(page: Page): Promise<ShotPayload> {
	// CSS pixels — avoid retina 2× device buffers (e.g. 2400×1906).
	const raw = await page.screenshot({ type: 'png', scale: 'css' });
	const { buffer, width, height, scale } = await downscaleImageBuffer(raw);
	lastShotScaleToViewport = scale;
	return {
		base64: buffer.toString('base64'),
		mediaType: 'image/jpeg',
		scaleToViewport: scale,
		width,
		height,
	};
}

function mapClaudeCoord(value: number): number {
	return Math.round(value * lastShotScaleToViewport);
}

function imageContentBlock(shot: Pick<ShotPayload, 'base64' | 'mediaType'>) {
	return {
		type: 'image' as const,
		source: {
			type: 'base64' as const,
			media_type: shot.mediaType,
			data: shot.base64,
		},
	};
}

/** Last-resort: recompress any image blocks before they hit the Anthropic API. */
async function ensureToolImagesFit(content: unknown): Promise<unknown> {
	if (!Array.isArray(content)) return content;
	const next = [];
	for (const block of content) {
		if (
			block &&
			typeof block === 'object' &&
			(block as { type?: string }).type === 'image'
		) {
			const source = (block as { source?: { data?: string } }).source;
			const data = source?.data;
			if (typeof data === 'string' && data.length > 0) {
				const raw = Buffer.from(data, 'base64');
				const { buffer } = await downscaleImageBuffer(raw);
				next.push(
					imageContentBlock({
						base64: buffer.toString('base64'),
						mediaType: 'image/jpeg',
					}),
				);
				continue;
			}
		}
		next.push(block);
	}
	return next;
}

type AriaNode = {
	role?: string;
	name?: string;
	text?: string;
	children?: AriaNode[];
	ref?: string;
};

async function buildAccessibilityTree(
	page: Page,
): Promise<{ text: string; refs: RefMap }> {
	const snapshot = (await page.ariaSnapshotJSON({
		mode: 'ai',
		timeout: 15_000,
	})) as AriaNode | AriaNode[];
	const refs: RefMap = new Map();
	let counter = 0;
	const lines: string[] = [];

	const walk = (node: AriaNode | null | undefined, depth: number) => {
		if (!node || typeof node !== 'object') return;
		const role = node.role || 'generic';
		const name = (node.name || node.text || '').trim().slice(0, 80);
		const interactive = [
			'button',
			'link',
			'textbox',
			'searchbox',
			'checkbox',
			'radio',
			'combobox',
			'menuitem',
			'tab',
			'switch',
		].includes(role);
		if (interactive || name) {
			counter += 1;
			const ref = `ref_${counter}`;
			refs.set(ref, JSON.stringify({ role, name }));
			lines.push(
				`${'  '.repeat(depth)}${role}${name ? ` "${name}"` : ''} [${ref}]`,
			);
		}
		for (const child of node.children || []) {
			walk(child, depth + 1);
		}
	};

	if (Array.isArray(snapshot)) {
		for (const node of snapshot) walk(node, 0);
	} else {
		walk(snapshot, 0);
	}

	const text = lines.join('\n').slice(0, 50_000);
	return { text: text || '(empty page)', refs };
}

async function resolveRef(
	page: Page,
	refs: RefMap,
	ref: string,
): Promise<import('playwright').Locator> {
	const raw = refs.get(ref);
	if (!raw) throw new Error(`Error: ${ref} is stale or not found on the current page.`);
	const { role, name } = JSON.parse(raw) as { role: string; name: string };
	if (name) {
		return page.getByRole(role as 'button', { name, exact: false }).first();
	}
	return page.getByRole(role as 'button').first();
}

function browserState(page: Page) {
	return {
		type: 'browser_state' as const,
		tabs: [
			{
				tab_id: 'tab-1',
				title: '',
				url: page.url(),
				active: true,
			},
		],
	};
}

async function runBrowserAction(
	page: Page,
	refs: RefMap,
	name: string,
	input: Record<string, unknown>,
): Promise<{
	content: unknown;
	refs: RefMap;
}> {
	const refreshTree = async () => {
		const tree = await buildAccessibilityTree(page);
		return tree;
	};

	switch (name) {
		case 'navigate': {
			const url = String(input.url || '');
			if (url === 'back') await page.goBack({ waitUntil: 'domcontentloaded' });
			else if (url === 'forward')
				await page.goForward({ waitUntil: 'domcontentloaded' });
			else if (url === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
			else {
				const href = url.includes('://') ? url : `https://${url}`;
				if (!/^https?:/i.test(href)) throw new Error('Only http(s) URLs allowed');
				await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
			}
			const state = browserState(page);
			state.tabs[0].title = await page.title().catch(() => '');
			return {
				content: [
					{ type: 'text', text: `Navigated to ${page.url()}` },
					state,
				],
				refs,
			};
		}
		case 'read_page': {
			const tree = await refreshTree();
			return {
				content: [{ type: 'text', text: tree.text }],
				refs: tree.refs,
			};
		}
		case 'find': {
			const query = String(input.query || '').toLowerCase();
			const tree = await refreshTree();
			const matches = tree.text
				.split('\n')
				.filter((line) => line.toLowerCase().includes(query))
				.slice(0, 20)
				.join('\n');
			return {
				content: [{ type: 'text', text: matches || 'No matches' }],
				refs: tree.refs,
			};
		}
		case 'screenshot': {
			const shot = await captureScreenshot(page);
			return {
				content: [imageContentBlock(shot)],
				refs,
			};
		}
		case 'zoom': {
			const region = input.region as number[] | undefined;
			if (!Array.isArray(region) || region.length < 4) {
				throw new Error('zoom requires region [x0,y0,x1,y1]');
			}
			const x0 = mapClaudeCoord(Number(region[0]));
			const y0 = mapClaudeCoord(Number(region[1]));
			const x1 = mapClaudeCoord(Number(region[2]));
			const y1 = mapClaudeCoord(Number(region[3]));
			const clip = {
				x: Math.min(x0, x1),
				y: Math.min(y0, y1),
				width: Math.max(1, Math.abs(x1 - x0)),
				height: Math.max(1, Math.abs(y1 - y0)),
			};
			const raw = await page.screenshot({ type: 'png', scale: 'css', clip });
			const { buffer } = await downscaleImageBuffer(raw);
			return {
				content: [
					imageContentBlock({
						base64: buffer.toString('base64'),
						mediaType: 'image/jpeg',
					}),
				],
				refs,
			};
		}
		case 'left_click':
		case 'double_click':
		case 'right_click':
		case 'hover':
		case 'mouse_move': {
			const target = (input.target || {}) as Record<string, unknown>;
			if (target.type === 'ref' && typeof target.ref === 'string') {
				const loc = await resolveRef(page, refs, target.ref);
				if (name === 'double_click') await loc.dblclick({ timeout: 8_000 });
				else if (name === 'right_click')
					await loc.click({ button: 'right', timeout: 8_000 });
				else if (name === 'hover' || name === 'mouse_move')
					await loc.hover({ timeout: 8_000 });
				else await loc.click({ timeout: 8_000 });
				return {
					content: [{ type: 'text', text: `${name} ${target.ref}` }],
					refs,
				};
			}
			const x = mapClaudeCoord(Number(target.x));
			const y = mapClaudeCoord(Number(target.y));
			if (name === 'hover' || name === 'mouse_move') await page.mouse.move(x, y);
			else if (name === 'double_click') await page.mouse.dblclick(x, y);
			else if (name === 'right_click')
				await page.mouse.click(x, y, { button: 'right' });
			else await page.mouse.click(x, y);
			return {
				content: [{ type: 'text', text: `${name} at (${x}, ${y})` }],
				refs,
			};
		}
		case 'left_mouse_down': {
			const target = (input.target || {}) as Record<string, unknown>;
			await page.mouse.move(
				mapClaudeCoord(Number(target.x)),
				mapClaudeCoord(Number(target.y)),
			);
			await page.mouse.down();
			return { content: [{ type: 'text', text: 'mouse down' }], refs };
		}
		case 'left_mouse_up': {
			const target = (input.target || {}) as Record<string, unknown>;
			if (target.x != null) {
				await page.mouse.move(
					mapClaudeCoord(Number(target.x)),
					mapClaudeCoord(Number(target.y)),
				);
			}
			await page.mouse.up();
			return { content: [{ type: 'text', text: 'mouse up' }], refs };
		}
		case 'type': {
			await page.keyboard.type(String(input.text || ''), { delay: 15 });
			return { content: [{ type: 'text', text: 'typed' }], refs };
		}
		case 'key': {
			const chord = String(input.text || 'Enter');
			const repeat = Math.min(20, Math.max(1, Number(input.repeat || 1)));
			for (let i = 0; i < repeat; i += 1) {
				await page.keyboard.press(chord.replace(/\+/g, '+'));
			}
			return { content: [{ type: 'text', text: `pressed ${chord}` }], refs };
		}
		case 'wait': {
			const sec = Math.min(30, Math.max(0, Number(input.duration || 1)));
			await page.waitForTimeout(sec * 1000);
			return { content: [{ type: 'text', text: `waited ${sec}s` }], refs };
		}
		case 'scroll': {
			const target = (input.target || {}) as Record<string, unknown>;
			const dir = String(input.scroll_direction || 'down');
			const amount = Math.min(10, Math.max(1, Number(input.scroll_amount || 3)));
			const delta = amount * 120;
			await page.mouse.move(
				mapClaudeCoord(Number(target.x || 640)),
				mapClaudeCoord(Number(target.y || 400)),
			);
			await page.mouse.wheel(
				dir === 'left' ? -delta : dir === 'right' ? delta : 0,
				dir === 'up' ? -delta : dir === 'down' ? delta : 0,
			);
			return { content: [{ type: 'text', text: `scrolled ${dir}` }], refs };
		}
		case 'form_input': {
			const target = (input.target || {}) as Record<string, unknown>;
			if (target.type !== 'ref' || typeof target.ref !== 'string') {
				throw new Error('form_input requires a ref target');
			}
			const loc = await resolveRef(page, refs, target.ref);
			const value = input.value;
			if (typeof value === 'boolean') {
				const checked = await loc.isChecked().catch(() => false);
				if (checked !== value) await loc.click();
			} else {
				// Replace existing value (e.g. pre-filled "Generic") — never append.
				await loc.click({ timeout: 5_000 });
				await loc.fill('');
				await loc.fill(String(value ?? ''));
			}
			return { content: [{ type: 'text', text: `filled ${target.ref}` }], refs };
		}
		case 'get_page_text': {
			const text = await page.evaluate(
				`() => (document.body?.innerText || '').slice(0, 50000)`,
			);
			return { content: [{ type: 'text', text: String(text) }], refs };
		}
		case 'list_tabs':
		case 'new_tab':
		case 'switch_tab':
		case 'close_tab': {
			const state = browserState(page);
			state.tabs[0].title = await page.title().catch(() => '');
			return { content: [state], refs };
		}
		default:
			throw new Error(`Unknown or unimplemented member: ${name}`);
	}
}

/** Parse "16 oz" / "12 fl oz" / etc. from food text; default 1 serving. */
function parseServingSize(text: string): { value: string; unit: string } {
	const src = text.trim();
	const match = src.match(
		/\b(\d+(?:\.\d+)?)\s*(fl\.?\s*oz\.?|fluid\s*ounces?|oz\.?|ounces?|g|grams?|kg|ml|milliliters?|l|liters?|cups?|tbsp|tablespoons?|tsp|teaspoons?|servings?|pieces?|slices?)\b/i,
	);
	if (!match) return { value: '1', unit: 'serving' };

	const value = match[1];
	const raw = match[2].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
	let unit = 'serving';
	if (/^fl\s*oz|^fluid\s*ounce/.test(raw)) unit = 'fl oz';
	else if (/^oz|^ounce/.test(raw)) unit = 'oz';
	else if (/^g$|^gram/.test(raw)) unit = 'g';
	else if (/^kg/.test(raw)) unit = 'kg';
	else if (/^ml|^milliliter/.test(raw)) unit = 'ml';
	else if (/^l$|^liter/.test(raw)) unit = 'l';
	else if (/^cup/.test(raw)) unit = 'cup';
	else if (/^tbsp|^tablespoon/.test(raw)) unit = 'tbsp';
	else if (/^tsp|^teaspoon/.test(raw)) unit = 'tsp';
	else if (/^piece/.test(raw)) unit = 'piece';
	else if (/^slice/.test(raw)) unit = 'slice';
	else if (/^serving/.test(raw)) unit = 'serving';

	return { value, unit };
}

function formatFood(food: FoodPayload): string {
	const r = food.result;
	const num = (v: unknown) =>
		v == null || Number.isNaN(Number(v)) ? 'unknown' : String(v);
	const serving = parseServingSize(
		[food.name, typeof r.title === 'string' ? r.title : '']
			.filter(Boolean)
			.join(' '),
	);
	return [
		`Brand / restaurant: ${food.brand?.trim() || '(leave blank if unknown)'}`,
		`Description: ${food.name}`,
		`Serving Size Value: ${serving.value}`,
		`Serving Size Unit: ${serving.unit}`,
		`Calories: ${num(r.calories)}`,
		`Total Fat (g): ${num(r.totalFatG)}`,
		`Saturated Fat (g): ${num(r.saturatedFatG)}`,
		`Cholesterol (mg): ${num(r.cholesterolMg)}`,
		`Sodium (mg): ${num(r.sodiumMg)}`,
		`Potassium (mg): ${num(r.potassiumMg)}`,
		`Total Carbs (g): ${num(r.totalCarbsG)}`,
		`Dietary Fiber (g): ${num(r.dietaryFiberG)}`,
		`Sugars (g): ${num(r.sugarsG)}`,
		`Protein (g): ${num(r.proteinG)}`,
	].join('\n');
}

async function waitMs(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

function pageUrl(page: Page): string {
	try {
		return String(page.url() ?? '');
	} catch {
		return '';
	}
}

async function findLoginField(
	page: Page,
	kind: 'email' | 'password',
): Promise<import('playwright').Locator | null> {
	const selectors =
		kind === 'email'
			? [
					'input[type="email"]',
					'input[name="email"]',
					'input[autocomplete="username"]',
				]
			: [
					'input[type="password"]',
					'input[name="password"]',
					'input[autocomplete="current-password"]',
				];
	for (const root of [page, ...page.frames()] as Array<
		Page | import('playwright').Frame
	>) {
		for (const selector of selectors) {
			try {
				const field = root.locator(selector).first();
				if ((await field.count()) === 0) continue;
				if (!(await field.isVisible().catch(() => false))) continue;
				return field;
			} catch {
				/* next */
			}
		}
	}
	return null;
}

/** Best-effort cookie OK click (Claude also handles this; used while waiting on human). */
async function dismissCookieOk(page: Page): Promise<boolean> {
	const tryIn = async (
		root: Page | import('playwright').Frame,
	): Promise<boolean> => {
		for (const selector of [
			'button.sp_choice_type_Accept',
			'button.button-ok',
			'.message-button.button-ok',
			'button:has-text("OK")',
		]) {
			try {
				const btn = root.locator(selector).first();
				if ((await btn.count()) === 0) continue;
				if (!(await btn.isVisible().catch(() => false))) continue;
				await btn.click({ timeout: 3_000 });
				return true;
			} catch {
				/* next */
			}
		}
		try {
			const byRole = root.getByRole('button', { name: /^ok$/i });
			if ((await byRole.count()) > 0) {
				await byRole.first().click({ timeout: 3_000 });
				return true;
			}
		} catch {
			/* next */
		}
		return false;
	};

	for (let i = 0; i < 8; i += 1) {
		if (await tryIn(page)) return true;
		for (const frame of page.frames()) {
			if (frame === page.mainFrame()) continue;
			if (await tryIn(frame)) return true;
		}
		await waitMs(400);
	}
	return false;
}

async function stillOnLogin(page: Page): Promise<boolean> {
	const url = pageUrl(page).toLowerCase();
	if (!url.includes('myfitnesspal.com')) return true;
	if (url.includes('/account/login') || url.includes('/auth/signin')) return true;
	if ((await findLoginField(page, 'password')) != null) return true;
	return false;
}

async function waitForHumanLogin(
	page: Page,
	log: (line: string) => Promise<unknown>,
	jobId: string,
	timeoutMs = 10 * 60 * 1000,
): Promise<boolean> {
	await patchJob(jobId, {
		status: 'needs_input',
		errorMessage:
			'Log in to MyFitnessPal in the Chromium window on your Mac (one-time). Session cookies are saved for later jobs.',
	});
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await dismissCookieOk(page).catch(() => false);
		if (!(await stillOnLogin(page))) {
			await log('MyFitnessPal session ready (saved in .mfp-profile)');
			await patchJob(jobId, { status: 'running', errorMessage: null });
			return true;
		}
		await waitMs(2_000);
	}
	return false;
}

/** Open diary; if redirected to login, wait for you to sign in once. */
async function ensureMfpSession(
	page: Page,
	log: (line: string) => Promise<unknown>,
	jobId: string,
): Promise<boolean> {
	await log('Checking saved MyFitnessPal session…');
	await page.goto('https://www.myfitnesspal.com/food/diary', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	});
	await waitMs(2_000);
	await dismissCookieOk(page).catch(() => false);
	await waitMs(800);

	if (!(await stillOnLogin(page))) {
		await log('Reusing saved session from .mfp-profile');
		return true;
	}

	await log(
		'No valid session — log in manually in the Chromium window (cookies will be reused next time)',
	);
	await page
		.goto('https://www.myfitnesspal.com/account/login', {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		})
		.catch(() => undefined);
	const ok = await waitForHumanLogin(page, log, jobId);
	if (!ok) return false;

	await page.goto('https://www.myfitnesspal.com/food/diary', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	});
	await waitMs(1_500);
	if (await stillOnLogin(page)) {
		await log('Still not signed in after manual login');
		return false;
	}
	await log('Session confirmed');
	return true;
}

async function runBrowserAgent(opts: {
	page: Page;
	refs: RefMap;
	jobId: string;
	log: (line: string) => Promise<unknown>;
	system: string;
	userMessage: string;
	maxIters?: number;
}): Promise<{ status: 'done' | 'needs_login' | 'max_iters'; refs: RefMap }> {
	const { page, jobId, log, system, userMessage } = opts;
	let { refs } = opts;
	const maxIters = opts.maxIters ?? 50;
	const messages: Anthropic.MessageParam[] = [
		{ role: 'user', content: userMessage },
	];

	for (let iter = 0; iter < maxIters; iter += 1) {
		const response = await anthropic.messages.create({
			model: 'claude-sonnet-5',
			max_tokens: 4096,
			system,
			// @ts-expect-error browser toolset typing lags the API
			tools: [{ type: 'browser_toolset_20260801' }],
			messages,
		});

		messages.push({ role: 'assistant', content: response.content });

		const toolUses = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
		);
		if (toolUses.length === 0) {
			const text = response.content
				.filter((b): b is Anthropic.TextBlock => b.type === 'text')
				.map((b) => b.text)
				.join('\n');
			await log(text.slice(0, 300) || 'Agent finished turn');
			if (await stillOnLogin(page)) {
				return { status: 'needs_login', refs };
			}
			return { status: 'done', refs };
		}

		const results: Anthropic.MessageParam['content'] = [];
		let failed = false;
		for (const use of toolUses) {
			if (failed) {
				results.push({
					type: 'tool_result',
					tool_use_id: use.id,
					toolset_name: 'browser',
					is_error: true,
					content: 'Not executed: an earlier action in this turn failed.',
				} as never);
				continue;
			}
			try {
				await log(`${use.name}`);
				const out = await runBrowserAction(
					page,
					refs,
					use.name,
					(use.input || {}) as Record<string, unknown>,
				);
				refs = out.refs;
				const content = await ensureToolImagesFit(out.content);
				results.push({
					type: 'tool_result',
					tool_use_id: use.id,
					toolset_name: 'browser',
					content,
				} as never);
			} catch (err) {
				failed = true;
				const message = err instanceof Error ? err.message : String(err);
				await log(`Tool error: ${message}`);
				results.push({
					type: 'tool_result',
					tool_use_id: use.id,
					toolset_name: 'browser',
					is_error: true,
					content: message,
				} as never);
			}
		}
		messages.push({ role: 'user', content: results });
	}

	return { status: 'max_iters', refs };
}

function buildSystemPrompt(meal: string, foods: FoodPayload[]): string {
	const foodsBlock = foods
		.map((f, i) => `### Food ${i + 1} of ${foods.length}\n${formatFood(f)}`)
		.join('\n\n');
	const multi = foods.length > 1;
	const saveButton = multi ? 'Save & Create Another' : 'Save Changes';

	return `You are automating MyFitnessPal in a real headed Chromium window on the user's Mac via browser tools.

The browser already has a logged-in session (persistent cookies). Do NOT go to the login page, do NOT fill email/password, and do NOT click Facebook/Google/Apple SSO. If you unexpectedly see a login form or captcha, stop and say the user must log in manually.

This job has ${foods.length} food(s). Diary meal for this time of day: "${meal}".

## Exact flow (follow this — do NOT use /food/builder)

For EACH food in order:

1. Navigate to https://www.myfitnesspal.com/food/submit (after "Save & Create Another" you are already sent back here — do not skip steps).
2. Fill the two inputs:
   - Brand / restaurant: the field is often pre-filled with "Generic". CLEAR/REPLACE that text (do not append). Use the food's brand if provided, otherwise leave a sensible brand or clear Generic as appropriate.
   - Description: the food description/name. Replace any existing text; do not append.
   Use form_input (or select-all + type) so values replace, never append.
3. Click Continue.
4. If you see "Submit a New Food — Are You Sure It's Not A Duplicate?", click Create Food.
5. On /food/new, FIRST fill Serving Size — there are two inputs: Value and Unit. Use that food's Serving Size Value and Serving Size Unit (already parsed; default is Value 1 / Unit serving when unspecified). Do this before any nutrition fields.
6. Then fill nutrition fields from that food's data (calories, fat, carbs, protein, etc.).
7. Turn ON the switch "Would you like to add this food to your food diary now?".
8. A select appears with Breakfast / Lunch / Dinner / Snacks — choose "${meal}".
9. Leave "Help us grow our food database!" unchecked.
10. Click "${saveButton}"${multi ? ' while more foods remain; on the last food click "Save Changes" instead' : ''}.

${multi ? `Because there are ${foods.length} foods: use "Save & Create Another" after foods 1–${foods.length - 1}, then "Save Changes" after food ${foods.length}. After "Save & Create Another" you return to /food/submit — repeat the flow for the next food.` : `There is only one food: after Save Changes you are done.`}

## Foods
${foodsBlock}

## Rules
- Never open /food/builder.
- On /food/new always set Serving Size Value + Unit before filling calories/macros.
- Always replace field values (especially clearing pre-filled "Generic"); never append.
- Prefer navigate → read_page / find before clicking.
- Use wait when the page is still loading.
- If a cookie banner with OK appears, click OK, then continue.
- When all foods are logged, reply with a short confirmation that you are done (no more tools).`;
}

async function runJob(claimed: ClaimedJob) {
	const { job, foods, meal } = claimed;
	let page: Page | null = null;
	let refs: RefMap = new Map();
	let dispose: (() => Promise<void>) | null = null;

	const log = (line: string) =>
		patchJob(job.id, { appendLog: line }).catch((err) =>
			console.warn('log patch failed', err),
		);

	try {
		await log(`Attaching browser (CDP ${CDP_URL} or profile)…`);
		const opened = await openMfpBrowser(PROFILE_DIR);
		dispose = opened.dispose;
		page = opened.page;
		await log(`Browser mode: ${opened.mode}`);

		const sessionOk = await ensureMfpSession(page, log, job.id);
		if (!sessionOk) {
			await patchJob(job.id, {
				status: 'error',
				errorMessage:
					'Timed out waiting for MyFitnessPal login. Use pnpm mfp-chrome, sign in, then retry.',
			});
			return;
		}

		const result = await runBrowserAgent({
			page,
			refs,
			jobId: job.id,
			log,
			system: buildSystemPrompt(meal, foods),
			userMessage: `You are already signed in. Log ${foods.length} food(s) via /food/submit. Replace pre-filled "Generic" in brand (do not append). On /food/new fill Serving Size Value + Unit first, then nutrition. After diary switch ON, select meal "${meal}". ${foods.length > 1 ? 'Use "Save & Create Another" until the last food, then "Save Changes".' : 'Click "Save Changes" when done.'} Do not touch login or SSO.`,
			maxIters: 45,
		});
		refs = result.refs;

		if (result.status === 'needs_login' || (await stillOnLogin(page))) {
			await log('Session expired mid-job — please log in again in Chrome');
			const ok = await waitForHumanLogin(page, log, job.id);
			if (!ok) {
				await patchJob(job.id, {
					status: 'error',
					errorMessage: 'Timed out waiting for login on Mac',
				});
				return;
			}
			const retry = await runBrowserAgent({
				page,
				refs,
				jobId: job.id,
				log,
				system: buildSystemPrompt(meal, foods),
				userMessage: `You are signed in again. Finish remaining foods: /food/submit, replace Generic, Serving Size Value+Unit before nutrition, diary meal "${meal}", ${foods.length > 1 ? 'Save & Create Another until last then Save Changes' : 'Save Changes'}.`,
				maxIters: 40,
			});
			if (retry.status === 'done' && !(await stillOnLogin(page))) {
				await patchJob(job.id, {
					status: 'done',
					errorMessage: null,
					appendLog:
						'Done — leaving Chrome open so your MFP session stays signed in',
					markLogged: true,
				});
				return;
			}
			await patchJob(job.id, {
				status: 'error',
				errorMessage: 'Could not finish after re-login',
			});
			return;
		}

		if (result.status === 'done') {
			await patchJob(job.id, {
				status: 'done',
				errorMessage: null,
				appendLog: 'Done — leaving Chrome open so your MFP session stays signed in',
				markLogged: true,
			});
			return;
		}

		await patchJob(job.id, {
			status: 'error',
			errorMessage: 'Agent stopped before finishing',
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[mfp-worker] job failed', message);
		await patchJob(job.id, {
			status: 'error',
			errorMessage: message,
			appendLog: `Error: ${message}`,
		}).catch(() => undefined);
	} finally {
		// CDP: disconnect only — never quit the user's Chrome (keeps login cookies).
		await dispose?.().catch(() => undefined);
	}
}

async function main() {
	console.log(
		`[mfp-worker] hub=${HUB_URL} host=${hostname()} cdp=${CDP_URL}`,
	);

	for (;;) {
		try {
			await heartbeat();
			console.log('[mfp-worker] connected to hub');
			break;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn(
				`[mfp-worker] hub unreachable (${HUB_URL}): ${message}. Retrying in ${POLL_MS}ms…`,
			);
			console.warn(
				'[mfp-worker] Start the API with `pnpm dev` or `pnpm dev:mfp`, or set GIO_HUB_URL.',
			);
			await new Promise((r) => setTimeout(r, POLL_MS));
		}
	}

	setInterval(() => {
		void heartbeat().catch((err) => console.warn('heartbeat failed', err));
	}, HEARTBEAT_MS);

	for (;;) {
		try {
			const claimed = await claimNext();
			if (claimed) {
				console.log(`[mfp-worker] claimed job ${claimed.job.id}`);
				await runJob(claimed);
			}
		} catch (err) {
			console.warn('[mfp-worker] poll error', err);
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
}

void main();
