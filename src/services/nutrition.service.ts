import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/config/anthropic';
import { ensureCloudinaryConfigured, cloudinary } from '@/config/cloudinary';
import { redis } from '@/config/redis';
import {
	AllowedNutritionImageType,
	MAX_NUTRITION_PHOTOS,
	MealParseSchema,
	NutritionEntry,
	NutritionEntrySchema,
	NutritionItem,
	NutritionPhoto,
	NutritionResult,
	NutritionResultSchema,
} from '@/models/nutrition.model';

const ENTRY_IDS_KEY = 'nutrition:entry_ids';

function entryKey(id: string): string {
	return `nutrition:entry:${id}`;
}

function nowIso(): string {
	return new Date().toISOString();
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	const objectMatch = candidate.match(/\{[\s\S]*\}/);
	return JSON.parse(objectMatch ? objectMatch[0] : candidate);
}

function mealPeriodLabel(date = new Date()): string {
	const hour = date.getHours();
	if (hour >= 5 && hour < 11) return 'Breakfast';
	if (hour >= 11 && hour < 16) return 'Lunch';
	if (hour >= 16 && hour < 22) return 'Dinner';
	return 'Late-night';
}

function buildEntryTitle(options: {
	restaurant?: string | null;
	itemNames: string[];
	itemTitles?: Array<string | null | undefined>;
}): string {
	if (options.itemNames.length <= 1) {
		const single =
			options.itemTitles?.[0]?.trim() ||
			options.itemNames[0]?.trim() ||
			'';
		return single ? fallbackItemTitle(single) : 'Untitled';
	}

	const period = mealPeriodLabel();
	const place = options.restaurant?.trim();
	return place ? `${period} at ${place}` : `${period} meal`;
}

function fallbackItemTitle(name: string): string {
	const cleaned = name.trim().replace(/\s+/g, ' ');
	return cleaned || 'Untitled';
}

function withSyncedPhotos(entry: NutritionEntry): NutritionEntry {
	let photos = entry.photos ?? [];
	if (
		photos.length === 0 &&
		entry.photoUrl?.trim() &&
		entry.photoPublicId?.trim()
	) {
		photos = [
			{
				url: entry.photoUrl.trim(),
				publicId: entry.photoPublicId.trim(),
			},
		];
	} else if (photos.length === 0 && entry.photoUrl?.trim()) {
		photos = [
			{
				url: entry.photoUrl.trim(),
				publicId: entry.photoPublicId?.trim() || entry.photoUrl.trim(),
			},
		];
	}

	const thumb = photos[0] ?? null;
	return {
		...entry,
		photos,
		photoUrl: thumb?.url ?? null,
		photoPublicId: thumb?.publicId ?? null,
	};
}

function migrateLegacyEntry(entry: NutritionEntry): NutritionEntry {
	const withPhotos = withSyncedPhotos(entry);

	if (withPhotos.items.length > 0) {
		return {
			...withPhotos,
			title:
				withPhotos.title?.trim() ||
				buildEntryTitle({
					restaurant: withPhotos.restaurant,
					itemNames: withPhotos.items.map((item) => item.name),
					itemTitles: withPhotos.items.map(
						(item) => item.result?.title || item.name,
					),
				}),
			result: null,
		};
	}

	if (withPhotos.result) {
		const name =
			withPhotos.result.title?.trim() ||
			fallbackItemTitle(withPhotos.query) ||
			'Item';
		const item: NutritionItem = {
			id: randomUUID(),
			name,
			status: withPhotos.status === 'calculating' ? 'idle' : withPhotos.status,
			errorMessage: withPhotos.errorMessage ?? null,
			result: {
				...withPhotos.result,
				title: withPhotos.result.title?.trim() || name,
			},
		};
		return {
			...withPhotos,
			restaurant: withPhotos.restaurant ?? null,
			title: withPhotos.title?.trim() || name,
			items: [item],
			result: null,
		};
	}

	return {
		...withPhotos,
		title: withPhotos.title?.trim() || null,
		items: [],
		result: null,
	};
}

async function saveEntry(entry: NutritionEntry): Promise<NutritionEntry> {
	const normalized = migrateLegacyEntry(NutritionEntrySchema.parse(entry));
	const parsed = NutritionEntrySchema.parse({
		...normalized,
		result: null,
	});
	await redis.set(entryKey(parsed.id), parsed);
	await redis.zadd(ENTRY_IDS_KEY, {
		score: new Date(parsed.updatedAt).getTime(),
		member: parsed.id,
	});
	return parsed;
}

async function readStoredEntry(id: string): Promise<NutritionEntry | null> {
	const raw = await redis.get<unknown>(entryKey(id));
	if (!raw) return null;
	const parsed = NutritionEntrySchema.safeParse(raw);
	if (!parsed.success) return null;
	return migrateLegacyEntry(parsed.data);
}

function recoverInterrupted(entry: NutritionEntry): NutritionEntry {
	const migrated = migrateLegacyEntry(entry);
	if (migrated.status !== 'calculating') {
		return {
			...migrated,
			items: migrated.items.map((item) =>
				item.status === 'calculating'
					? {
							...item,
							status: 'idle' as const,
							errorMessage: item.errorMessage ?? 'Calculation interrupted',
						}
					: item,
			),
		};
	}
	return {
		...migrated,
		status: 'idle',
		errorMessage: migrated.errorMessage ?? 'Calculation interrupted',
		items: migrated.items.map((item) =>
			item.status === 'calculating'
				? {
						...item,
						status: 'idle' as const,
						errorMessage: item.errorMessage ?? 'Calculation interrupted',
					}
				: item,
		),
	};
}

export async function listEntries(): Promise<NutritionEntry[]> {
	const ids = await redis.zrange<string[]>(ENTRY_IDS_KEY, 0, -1, {
		rev: true,
	});
	if (!ids || ids.length === 0) return [];

	const entries = await Promise.all(ids.map((id) => readStoredEntry(id)));
	return entries
		.filter((entry): entry is NutritionEntry => entry !== null)
		.map(recoverInterrupted);
}

export async function getEntry(id: string): Promise<NutritionEntry | null> {
	const entry = await readStoredEntry(id);
	return entry ? recoverInterrupted(entry) : null;
}

export async function createEntry(query = ''): Promise<NutritionEntry> {
	const ts = nowIso();
	const entry: NutritionEntry = {
		id: randomUUID(),
		query: query.trim(),
		restaurant: null,
		title: null,
		description: null,
		website: null,
		photos: [],
		photoUrl: null,
		photoPublicId: null,
		items: [],
		status: 'idle',
		errorMessage: null,
		result: null,
		createdAt: ts,
		updatedAt: ts,
	};
	return saveEntry(entry);
}

export async function updateEntry(
	id: string,
	patch: {
		query?: string;
		restaurant?: string | null;
		description?: string | null;
		website?: string | null;
	},
): Promise<NutritionEntry | null> {
	const existing = await readStoredEntry(id);
	if (!existing) return null;

	const nextWebsite =
		patch.website === undefined
			? existing.website
			: patch.website === ''
				? null
				: patch.website;
	const nextDescription =
		patch.description === undefined
			? existing.description
			: patch.description === ''
				? null
				: patch.description;
	const nextRestaurant =
		patch.restaurant === undefined
			? existing.restaurant
			: patch.restaurant === ''
				? null
				: patch.restaurant;

	const updated: NutritionEntry = {
		...existing,
		query: patch.query !== undefined ? patch.query : existing.query,
		restaurant: nextRestaurant,
		title:
			nextRestaurant !== existing.restaurant && existing.items.length > 1
				? buildEntryTitle({
						restaurant: nextRestaurant,
						itemNames: existing.items.map((item) => item.name),
						itemTitles: existing.items.map(
							(item) => item.result?.title || item.name,
						),
					})
				: existing.title,
		description: nextDescription,
		website: nextWebsite,
		updatedAt: nowIso(),
	};
	return saveEntry(updated);
}

export async function deleteEntry(id: string): Promise<boolean> {
	const existing = await readStoredEntry(id);
	if (!existing) return false;

	const publicIds = new Set<string>();
	for (const photo of existing.photos ?? []) {
		if (photo.publicId) publicIds.add(photo.publicId);
	}
	if (existing.photoPublicId) publicIds.add(existing.photoPublicId);

	if (publicIds.size > 0) {
		ensureCloudinaryConfigured();
		await Promise.all(
			[...publicIds].map(async (publicId) => {
				try {
					await cloudinary.uploader.destroy(publicId);
				} catch (err) {
					console.warn(`Failed to delete nutrition photo ${publicId}:`, err);
				}
			}),
		);
	}

	await redis.del(entryKey(id));
	await redis.zrem(ENTRY_IDS_KEY, id);
	return true;
}

export async function attachPhotos(
	id: string,
	files: Array<{ buffer: Buffer; mimetype: AllowedNutritionImageType }>,
): Promise<NutritionEntry | null> {
	const existing = await readStoredEntry(id);
	if (!existing) return null;
	if (files.length === 0) return existing;

	const current = existing.photos ?? [];
	const remaining = MAX_NUTRITION_PHOTOS - current.length;
	if (remaining <= 0) {
		throw new Error(`At most ${MAX_NUTRITION_PHOTOS} photos allowed`);
	}

	const toUpload = files.slice(0, remaining);
	ensureCloudinaryConfigured();

	const uploaded: NutritionPhoto[] = [];
	for (const file of toUpload) {
		const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
		const result = await cloudinary.uploader.upload(dataUri, {
			folder: 'nutrition',
			resource_type: 'image',
		});
		uploaded.push({
			url: result.secure_url,
			publicId: result.public_id,
		});
	}

	const photos = [...current, ...uploaded];
	const thumb = photos[0] ?? null;

	return saveEntry({
		...existing,
		photos,
		photoUrl: thumb?.url ?? null,
		photoPublicId: thumb?.publicId ?? null,
		updatedAt: nowIso(),
	});
}

function collectText(content: Anthropic.ContentBlock[]): string {
	return content
		.filter((block): block is Anthropic.TextBlock => block.type === 'text')
		.map((block) => block.text)
		.join('\n')
		.trim();
}

const webTools: Anthropic.Messages.ToolUnion[] = [
	{
		type: 'web_search_20250305',
		name: 'web_search',
		max_uses: 5,
	},
	{
		type: 'web_fetch_20250910',
		name: 'web_fetch',
		max_uses: 5,
		citations: { enabled: true },
	},
];

function buildParsePrompt(entry: NutritionEntry): string {
	const restaurantHint = entry.restaurant?.trim()
		? `User-listed restaurant/place: ${entry.restaurant.trim()}`
		: 'Restaurant/place may be embedded in the query.';

	return `Split this meal inquiry into a restaurant/place (if any) and individual food/drink items.

Query (may include ingredients, weight, prep notes, or multiple items):
"""
${entry.query}
"""
${restaurantHint}

Respond with ONLY JSON (no markdown):
{
  "restaurant": string|null,
  "items": string[]
}

Rules:
- items must be individual menu items / foods / drinks to estimate separately
- Prefer the user's wording, cleaned into short names (e.g. "Blueberry pancakes")
- If the query is a single item, return one item
- restaurant should be the venue/brand name when present, else null`;
}

async function parseMealItems(
	entry: NutritionEntry,
): Promise<{ restaurant: string | null; itemNames: string[] }> {
	const message = await anthropic.messages.create({
		model: 'claude-sonnet-5',
		max_tokens: 1024,
		messages: [{ role: 'user', content: buildParsePrompt(entry) }],
	});

	const text = collectText(message.content);
	if (!text) {
		throw new Error('Could not parse meal items');
	}

	const parsed = MealParseSchema.safeParse(extractJsonObject(text));
	if (!parsed.success) {
		throw new Error(`Invalid meal parse JSON: ${text.slice(0, 400)}`);
	}

	const restaurant =
		parsed.data.restaurant?.trim() || entry.restaurant?.trim() || null;
	const itemNames = parsed.data.items
		.map((name) => name.trim())
		.filter(Boolean);

	if (itemNames.length === 0) {
		throw new Error('No food items found to calculate');
	}

	return { restaurant, itemNames };
}

function buildItemPrompt(
	entry: NutritionEntry,
	itemName: string,
): string {
	const restaurantLine = entry.restaurant?.trim()
		? `Restaurant/place: ${entry.restaurant.trim()}`
		: 'No restaurant provided.';
	const websiteLine = entry.website?.trim()
		? `Legacy website field (fetch with web_fetch): ${entry.website.trim()}`
		: 'If the query contains one or more http(s) URLs, fetch them with web_fetch first. Otherwise use web_search to find the restaurant/menu/nutrition page if a place is named, then web_fetch promising URLs.';
	const photoCount = entry.photos?.length ?? (entry.photoUrl ? 1 : 0);
	const photoLine =
		photoCount > 1
			? `${photoCount} photos are attached — the first is the primary shot; use them only if they help estimate this specific item.`
			: photoCount === 1
				? 'A photo is attached — use it only if it helps estimate this specific item.'
				: 'No photo attached.';

	return `You are a nutrition calculator. Estimate nutrition for ONE menu item from a meal inquiry (not a diary log).

Item: "${itemName}"
${restaurantLine}
Full query (may include ingredients, weight, prep, URLs, or other items): "${entry.query}"
${websiteLine}
${photoLine}

Steps:
1. If the query includes a URL, fetch it with web_fetch before searching elsewhere.
2. If a restaurant or brand is mentioned, search for its official site/menu and nutrition info for this item.
3. Prefer published nutrition facts when available; otherwise estimate from similar items.
4. Use query details/photo only when relevant to this item.

Respond with ONLY a JSON object (no markdown fences) with these keys (use null when unknown):
{
  "title": string,
  "calories": number|null,
  "totalFatG": number|null,
  "saturatedFatG": number|null,
  "polyunsaturatedFatG": number|null,
  "monounsaturatedFatG": number|null,
  "transFatG": number|null,
  "cholesterolMg": number|null,
  "sodiumMg": number|null,
  "potassiumMg": number|null,
  "totalCarbsG": number|null,
  "dietaryFiberG": number|null,
  "sugarsG": number|null,
  "addedSugarsG": number|null,
  "proteinG": number|null,
  "vitaminAPct": number|null,
  "vitaminCPct": number|null,
  "calciumPct": number|null,
  "ironPct": number|null,
  "vitaminDPct": number|null,
  "sourcesExplanation": string
}

title should be a short clean name for this item (e.g. "Blueberry Pancakes").
sourcesExplanation must briefly list sources and how numbers were derived.`;
}

async function runItemCalculation(
	entry: NutritionEntry,
	itemName: string,
): Promise<NutritionResult> {
	const content: Anthropic.ContentBlockParam[] = [];

	const photoUrls =
		entry.photos?.length > 0
			? entry.photos.map((photo) => photo.url)
			: entry.photoUrl
				? [entry.photoUrl]
				: [];
	for (const url of photoUrls) {
		content.push({
			type: 'image',
			source: { type: 'url', url },
		});
	}

	content.push({ type: 'text', text: buildItemPrompt(entry, itemName) });

	const message = await anthropic.messages.create({
		model: 'claude-sonnet-5',
		max_tokens: 4096,
		tools: webTools,
		messages: [{ role: 'user', content }],
	});

	const text = collectText(message.content);
	if (!text) {
		throw new Error(`Claude returned no nutrition JSON for ${itemName}`);
	}

	const parsed = NutritionResultSchema.safeParse(extractJsonObject(text));
	if (!parsed.success) {
		throw new Error(
			`Invalid nutrition JSON for ${itemName}: ${text.slice(0, 400)}`,
		);
	}

	return {
		...parsed.data,
		title: parsed.data.title.trim() || fallbackItemTitle(itemName),
	};
}

function deriveEntryStatus(
	items: NutritionItem[],
): NutritionEntry['status'] {
	if (items.length === 0) return 'idle';
	if (items.some((item) => item.status === 'calculating')) return 'calculating';
	if (items.every((item) => item.status === 'ready')) return 'ready';
	if (items.some((item) => item.status === 'error')) return 'error';
	return 'idle';
}

export async function calculateEntry(
	id: string,
): Promise<NutritionEntry | null> {
	const existing = await readStoredEntry(id);
	if (!existing) return null;

	if (!existing.query.trim() && existing.items.length === 0) {
		return saveEntry({
			...existing,
			status: 'error',
			errorMessage: 'Enter food items first',
			updatedAt: nowIso(),
		});
	}

	await saveEntry({
		...existing,
		status: 'calculating',
		errorMessage: null,
		items: existing.items.map((item) => ({
			...item,
			status: 'calculating',
			errorMessage: null,
		})),
		updatedAt: nowIso(),
	});

	try {
		const latest = (await readStoredEntry(id)) ?? existing;

		let restaurant = latest.restaurant?.trim() || null;
		let itemNames =
			latest.items.length > 0
				? latest.items.map((item) => item.name.trim()).filter(Boolean)
				: [];

		if (itemNames.length === 0 || latest.query.trim()) {
			// Re-parse from query when present so multi-item text stays the source of truth.
			const parsed = await parseMealItems(latest);
			restaurant = parsed.restaurant || restaurant;
			itemNames = parsed.itemNames;
		}

		const pendingTitle = buildEntryTitle({
			restaurant,
			itemNames,
		});
		const pendingItems: NutritionItem[] = itemNames.map((name, index) => ({
			id: latest.items[index]?.id ?? randomUUID(),
			name,
			status: 'calculating',
			errorMessage: null,
			result: null,
		}));

		await saveEntry({
			...latest,
			restaurant,
			title: pendingTitle,
			items: pendingItems,
			status: 'calculating',
			errorMessage: null,
			result: null,
			updatedAt: nowIso(),
		});

		const settled = await Promise.all(
			pendingItems.map(async (item) => {
				try {
					const result = await runItemCalculation(
						{ ...latest, restaurant, title: pendingTitle },
						item.name,
					);
					return {
						...item,
						name: result.title || item.name,
						status: 'ready' as const,
						errorMessage: null,
						result,
					};
				} catch (err) {
					return {
						...item,
						status: 'error' as const,
						errorMessage:
							err instanceof Error ? err.message : 'Item calculation failed',
						result: null,
					};
				}
			}),
		);

		const title = buildEntryTitle({
			restaurant,
			itemNames: settled.map((item) => item.name),
			itemTitles: settled.map((item) => item.result?.title || item.name),
		});

		const after = (await readStoredEntry(id)) ?? latest;
		const status = deriveEntryStatus(settled);
		const errorMessage =
			status === 'error'
				? settled
						.filter((item) => item.status === 'error')
						.map((item) => item.errorMessage)
						.filter(Boolean)
						.join('; ') || 'Some items failed'
				: null;

		return saveEntry({
			...after,
			restaurant,
			title,
			items: settled,
			status,
			errorMessage,
			result: null,
			updatedAt: nowIso(),
		});
	} catch (err) {
		const after = (await readStoredEntry(id)) ?? existing;
		const message =
			err instanceof Error ? err.message : 'Nutrition calculation failed';
		return saveEntry({
			...after,
			status: 'error',
			errorMessage: message,
			items: after.items.map((item) =>
				item.status === 'calculating'
					? { ...item, status: 'error', errorMessage: message }
					: item,
			),
			updatedAt: nowIso(),
		});
	}
}
