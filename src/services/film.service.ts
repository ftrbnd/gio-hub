import { randomBytes } from 'node:crypto';
import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
import sharp from 'sharp';
import { anthropic } from '@/config/anthropic';
import { cloudinary, ensureCloudinaryConfigured } from '@/config/cloudinary';
import { redis } from '@/config/redis';
import { DiscordActionRow, DiscordEmbed } from '@/models/discord.model';
import {
	FilmAsset,
	FilmReviewPhoto,
	FilmReviewSession,
	OrientAssetResult,
	OrientFolderResult,
	OrientationDecision,
	OrientationDecisionSchema,
	RotateAngle,
} from '@/models/film.model';

const ORIENT_PROMPT = `You are checking film photos that were scanned and uploaded as landscape (horizontal) images. Some frames were shot vertically (portrait) and appear sideways — those need a 90° rotation so the subject is upright.

Look at this photo and decide:
- If it already looks correctly oriented as a landscape shot, do not rotate.
- If the subject / horizon looks sideways and the photo should be portrait, rotate it.

Respond with ONLY JSON, no prose, no markdown:
{"rotate": true|false, "angle": 0|90|-90}

Rules for angle (clockwise degrees applied to the current image):
- 0 when rotate is false
- 90 to rotate clockwise (top of the upright photo is currently on the left)
- -90 to rotate counterclockwise (top of the upright photo is currently on the right)`;

const REVIEW_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const REVIEW_SESSION_KEY_PREFIX = 'film:review:';

export const FILM_CUSTOM_ID_PREFIX = 'film:';

function escapeSearchValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function reviewSessionKey(sessionId: string): string {
	return `${REVIEW_SESSION_KEY_PREFIX}${sessionId}`;
}

export function displayName(publicId: string): string {
	const slash = publicId.lastIndexOf('/');
	return slash >= 0 ? publicId.slice(slash + 1) : publicId;
}

export async function listAssetsInFolder(folder: string): Promise<FilmAsset[]> {
	ensureCloudinaryConfigured();

	const assets: FilmAsset[] = [];
	let nextCursor: string | undefined;

	do {
		let query = cloudinary.search
			.expression(
				`resource_type:image AND asset_folder="${escapeSearchValue(folder)}"`,
			)
			.max_results(100)
			.sort_by('public_id', 'asc');

		if (nextCursor) {
			query = query.next_cursor(nextCursor);
		}

		const page = await query.execute();
		for (const resource of page.resources ?? []) {
			assets.push({
				publicId: resource.public_id,
				secureUrl: resource.secure_url,
				width: resource.width,
				height: resource.height,
				format: resource.format,
				assetFolder: resource.asset_folder ?? folder,
			});
		}
		nextCursor = page.next_cursor;
	} while (nextCursor);

	return assets;
}

function previewUrl(publicId: string): string {
	return cloudinary.url(publicId, {
		secure: true,
		transformation: [
			{ width: 800, crop: 'limit', quality: 'auto', fetch_format: 'jpg' },
		],
	});
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	return JSON.parse(candidate);
}

export async function detectOrientation(
	asset: FilmAsset,
): Promise<OrientationDecision> {
	const message = await anthropic.messages.create({
		model: 'claude-sonnet-5',
		max_tokens: 128,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'image',
						source: {
							type: 'url',
							url: previewUrl(asset.publicId),
						},
					},
					{ type: 'text', text: ORIENT_PROMPT },
				],
			},
		],
	});

	const textBlock = message.content.find((block) => block.type === 'text');
	if (!textBlock || textBlock.type !== 'text') {
		throw new Error(`Claude returned no text for ${asset.publicId}`);
	}

	const parsed = OrientationDecisionSchema.safeParse(
		extractJsonObject(textBlock.text),
	);
	if (!parsed.success) {
		throw new Error(
			`Claude orientation JSON invalid for ${asset.publicId}: ${textBlock.text}`,
		);
	}

	const decision = parsed.data;
	if (!decision.rotate && decision.angle !== 0) {
		return { rotate: false, angle: 0 };
	}
	if (decision.rotate && decision.angle === 0) {
		throw new Error(
			`Claude said rotate=true but angle=0 for ${asset.publicId}`,
		);
	}
	return decision;
}

async function downloadAsset(
	sourceUrl: string,
	publicId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
	const download = await fetch(sourceUrl);
	if (!download.ok) {
		throw new Error(
			`Failed to download ${publicId}: HTTP ${download.status}`,
		);
	}

	const contentType =
		download.headers.get('content-type') || 'application/octet-stream';
	const buffer = Buffer.from(await download.arrayBuffer());
	return { buffer, contentType };
}

function toDataUri(buffer: Buffer, contentType: string): string {
	return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function downloadAsDataUri(sourceUrl: string, publicId: string): Promise<string> {
	const { buffer, contentType } = await downloadAsset(sourceUrl, publicId);
	return toDataUri(buffer, contentType);
}

function assetSourceUrl(
	asset: Pick<FilmAsset, 'publicId'> & { secureUrl?: string },
): string {
	return (
		asset.secureUrl ||
		cloudinary.url(asset.publicId, {
			secure: true,
			resource_type: 'image',
			type: 'upload',
		})
	);
}

async function overwriteAsset(
	asset: Pick<FilmAsset, 'publicId' | 'assetFolder'>,
	dataUri: string,
	transformation: Record<string, unknown>[],
) {
	return cloudinary.uploader.upload(dataUri, {
		public_id: asset.publicId,
		overwrite: true,
		invalidate: true,
		asset_folder: asset.assetFolder,
		use_filename: true,
		unique_filename: false,
		transformation,
	});
}

/** Pad bar colors we may have written (current + previous pure white). */
const PAD_COLORS = [
	{ r: 244, g: 244, b: 245 }, // #f4f4f5
	{ r: 255, g: 255, b: 255 }, // #ffffff
] as const;
const PAD_COLOR_TOLERANCE = 14;
const MIN_BAR_WIDTH_PX = 8;
const BAR_COLUMN_MATCH_RATIO = 0.95;

function isPadPixel(r: number, g: number, b: number): boolean {
	return PAD_COLORS.some(
		(c) =>
			Math.abs(r - c.r) <= PAD_COLOR_TOLERANCE &&
			Math.abs(g - c.g) <= PAD_COLOR_TOLERANCE &&
			Math.abs(b - c.b) <= PAD_COLOR_TOLERANCE,
	);
}

/**
 * Detect symmetric side letterbox bars (from a prior pad-to-3:2). Returns
 * the bar width to crop from each side on the *full-resolution* image, or 0.
 */
export async function detectVerticalBarWidth(buffer: Buffer): Promise<number> {
	const meta = await sharp(buffer).metadata();
	const fullWidth = meta.width ?? 0;
	const fullHeight = meta.height ?? 0;
	// Side bars only appear on landscape canvases (padded portraits).
	if (fullWidth <= fullHeight || fullWidth === 0) return 0;

	const previewWidth = Math.min(800, fullWidth);
	const scale = previewWidth / fullWidth;

	const { data, info } = await sharp(buffer)
		.resize({ width: previewWidth, withoutEnlargement: true })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const { width, height, channels } = info;
	const step = Math.max(1, Math.floor(height / 120));

	function columnIsBar(x: number): boolean {
		let match = 0;
		let samples = 0;
		for (let y = 0; y < height; y += step) {
			const i = (y * width + x) * channels;
			samples++;
			if (isPadPixel(data[i], data[i + 1], data[i + 2])) match++;
		}
		return samples > 0 && match / samples >= BAR_COLUMN_MATCH_RATIO;
	}

	let left = 0;
	const maxBar = Math.floor(width / 3);
	while (left < maxBar && columnIsBar(left)) left++;

	let right = 0;
	while (right < maxBar && columnIsBar(width - 1 - right)) right++;

	const minPreviewBar = Math.max(2, Math.round(MIN_BAR_WIDTH_PX * scale));
	if (left < minPreviewBar || right < minPreviewBar) return 0;
	// Letterboxing should be roughly symmetric.
	if (Math.abs(left - right) > Math.max(left, right) * 0.3) return 0;

	return Math.max(MIN_BAR_WIDTH_PX, Math.round(Math.min(left, right) / scale));
}

/**
 * If the image has vertical pad bars, crop them off so a subsequent rotate
 * does not turn side bars into a border around the whole frame.
 */
export async function stripVerticalPadBars(
	buffer: Buffer,
	contentType: string,
): Promise<{ buffer: Buffer; contentType: string; stripped: boolean }> {
	const barWidth = await detectVerticalBarWidth(buffer);
	if (barWidth === 0) {
		return { buffer, contentType, stripped: false };
	}

	const meta = await sharp(buffer).metadata();
	const width = meta.width ?? 0;
	const height = meta.height ?? 0;
	if (width <= barWidth * 2) {
		return { buffer, contentType, stripped: false };
	}

	let pipeline = sharp(buffer).extract({
		left: barWidth,
		top: 0,
		width: width - barWidth * 2,
		height,
	});

	const format = meta.format;
	let outType = contentType;
	if (format === 'png') {
		pipeline = pipeline.png();
		outType = 'image/png';
	} else if (format === 'webp') {
		pipeline = pipeline.webp({ quality: 95 });
		outType = 'image/webp';
	} else {
		pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
		outType = 'image/jpeg';
	}

	const cropped = await pipeline.toBuffer();
	return { buffer: cropped, contentType: outType, stripped: true };
}

/**
 * If the image is portrait (taller than wide), pad with #f4f4f5 bars to 3:2
 * landscape. Horizontal images are left unchanged.
 */
export async function padVerticalToLandscape(
	asset: Pick<FilmAsset, 'publicId' | 'assetFolder'> & {
		secureUrl?: string;
		width: number;
		height: number;
	},
): Promise<{ secureUrl: string; padded: boolean }> {
	ensureCloudinaryConfigured();

	if (asset.width >= asset.height) {
		return {
			secureUrl: asset.secureUrl || assetSourceUrl(asset),
			padded: false,
		};
	}

	const dataUri = await downloadAsDataUri(assetSourceUrl(asset), asset.publicId);
	const result = await overwriteAsset(asset, dataUri, [
		{ aspect_ratio: '3:2', crop: 'pad', background: 'rgb:f4f4f5' },
	]);

	return { secureUrl: result.secure_url, padded: true };
}

export async function rotateAsset(
	asset: Pick<FilmAsset, 'publicId' | 'assetFolder'> & { secureUrl?: string },
	angle: RotateAngle,
): Promise<{ secureUrl: string; padded: boolean }> {
	ensureCloudinaryConfigured();

	// Cloudinary often returns HTTP 420 when asked to fetch its own delivery
	// URLs as an upload source. Download the bytes ourselves, then re-upload
	// with an incoming angle transformation so the stored original is replaced.
	// Prefer a versioned secureUrl so we do not re-download a stale CDN copy.
	const downloaded = await downloadAsset(assetSourceUrl(asset), asset.publicId);
	const stripped = await stripVerticalPadBars(
		downloaded.buffer,
		downloaded.contentType,
	);
	const dataUri = toDataUri(stripped.buffer, stripped.contentType);

	const result = await overwriteAsset(asset, dataUri, [{ angle }]);

	return padVerticalToLandscape({
		publicId: asset.publicId,
		assetFolder: asset.assetFolder,
		secureUrl: result.secure_url,
		width: result.width,
		height: result.height,
	});
}

async function orientOneAsset(asset: FilmAsset): Promise<OrientAssetResult> {
	try {
		const decision = await detectOrientation(asset);
		if (!decision.rotate || decision.angle === 0) {
			const padded = await padVerticalToLandscape(asset);
			if (!padded.padded) {
				return { publicId: asset.publicId, rotated: false, angle: 0 };
			}
			return {
				publicId: asset.publicId,
				rotated: false,
				angle: 0,
				padded: true,
				secureUrl: padded.secureUrl,
				assetFolder: asset.assetFolder,
			};
		}

		const { secureUrl, padded } = await rotateAsset(asset, decision.angle);
		return {
			publicId: asset.publicId,
			rotated: true,
			angle: decision.angle,
			padded,
			secureUrl,
			assetFolder: asset.assetFolder,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			publicId: asset.publicId,
			rotated: false,
			angle: 0,
			error: message,
		};
	}
}

export async function orientFolder(folder: string): Promise<OrientFolderResult> {
	const assets = await listAssetsInFolder(folder);
	const results: OrientAssetResult[] = [];

	// Sequential on purpose — avoids bursting Claude / Cloudinary rate limits
	// on a full film roll.
	for (const asset of assets) {
		results.push(await orientOneAsset(asset));
	}

	return {
		folder,
		checked: results.length,
		rotated: results.filter((r) => r.rotated).length,
		failed: results.filter((r) => r.error).length,
		results,
	};
}

export async function createReviewSession(
	result: OrientFolderResult,
): Promise<{ sessionId: string; session: FilmReviewSession } | null> {
	const photos: FilmReviewPhoto[] = result.results
		.filter((r): r is OrientAssetResult & { secureUrl: string; assetFolder: string } =>
			Boolean(r.secureUrl && r.assetFolder && (r.rotated || r.padded)),
		)
		.map((r) => ({
			publicId: r.publicId,
			assetFolder: r.assetFolder,
			secureUrl: r.secureUrl,
		}));

	if (photos.length === 0) return null;

	const sessionId = randomBytes(8).toString('hex');
	const session: FilmReviewSession = {
		folder: result.folder,
		photos,
		index: 0,
		checked: result.checked,
		failed: result.failed,
	};

	await redis.set(reviewSessionKey(sessionId), session, {
		ex: REVIEW_SESSION_TTL_SECONDS,
	});

	return { sessionId, session };
}

export async function getReviewSession(
	sessionId: string,
): Promise<FilmReviewSession | null> {
	return redis.get<FilmReviewSession>(reviewSessionKey(sessionId));
}

async function saveReviewSession(
	sessionId: string,
	session: FilmReviewSession,
): Promise<void> {
	await redis.set(reviewSessionKey(sessionId), session, {
		ex: REVIEW_SESSION_TTL_SECONDS,
	});
}

export function parseFilmCustomId(
	customId: string,
):
	| { kind: 'rot'; angle: RotateAngle; sessionId: string }
	| { kind: 'nav'; direction: 'prev' | 'next'; sessionId: string }
	| null {
	const match = customId.match(
		/^film:(rot|nav):(90|-90|180|prev|next):([a-f0-9]+)$/,
	);
	if (!match) return null;

	const [, kind, action, sessionId] = match;
	if (kind === 'rot') {
		if (action !== '90' && action !== '-90' && action !== '180') return null;
		return { kind: 'rot', angle: Number(action) as RotateAngle, sessionId };
	}
	if (action !== 'prev' && action !== 'next') return null;
	return { kind: 'nav', direction: action, sessionId };
}

export function reviewButtonRows(
	sessionId: string,
	session: FilmReviewSession,
): DiscordActionRow[] {
	const atStart = session.index <= 0;
	const atEnd = session.index >= session.photos.length - 1;

	return [
		{
			type: MessageComponentTypes.ACTION_ROW,
			components: [
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:rot:90:${sessionId}`,
					label: '↻ 90°',
					style: ButtonStyleTypes.PRIMARY,
				},
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:rot:-90:${sessionId}`,
					label: '↺ 90°',
					style: ButtonStyleTypes.PRIMARY,
				},
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:rot:180:${sessionId}`,
					label: '180°',
					style: ButtonStyleTypes.PRIMARY,
				},
			],
		},
		{
			type: MessageComponentTypes.ACTION_ROW,
			components: [
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:nav:prev:${sessionId}`,
					label: 'Previous',
					style: ButtonStyleTypes.SECONDARY,
					disabled: atStart,
				},
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:nav:next:${sessionId}`,
					label: 'Next',
					style: ButtonStyleTypes.SECONDARY,
					disabled: atEnd,
				},
			],
		},
	];
}

export function reviewEmbed(session: FilmReviewSession): DiscordEmbed {
	const photo = session.photos[session.index];
	const name = displayName(photo.publicId);
	const photoWord = session.photos.length === 1 ? 'photo' : 'photos';
	const failedNote =
		session.failed > 0 ? ` · ${session.failed} failed` : '';

	return {
		title: name,
		description: `Updated **${session.photos.length}** ${photoWord} in \`${session.folder}\` (${session.checked} checked${failedNote}). Portrait frames are padded to 3:2.`,
		color: session.failed > 0 ? 0xfaa61a : 0x57f287,
		image: { url: photo.secureUrl },
		footer: {
			text: `${session.index + 1} / ${session.photos.length}`,
		},
	};
}

export function reviewMessagePayload(
	sessionId: string,
	session: FilmReviewSession,
): { embeds: DiscordEmbed[]; components: DiscordActionRow[] } {
	return {
		embeds: [reviewEmbed(session)],
		components: reviewButtonRows(sessionId, session),
	};
}

export async function navigateReview(
	sessionId: string,
	direction: 'prev' | 'next',
): Promise<{ sessionId: string; session: FilmReviewSession }> {
	const session = await getReviewSession(sessionId);
	if (!session) {
		throw new FilmReviewSessionExpiredError();
	}

	const nextIndex =
		direction === 'prev'
			? Math.max(0, session.index - 1)
			: Math.min(session.photos.length - 1, session.index + 1);

	session.index = nextIndex;
	await saveReviewSession(sessionId, session);
	return { sessionId, session };
}

export async function applyReviewRotation(
	sessionId: string,
	angle: RotateAngle,
): Promise<{ sessionId: string; session: FilmReviewSession }> {
	const session = await getReviewSession(sessionId);
	if (!session) {
		throw new FilmReviewSessionExpiredError();
	}

	const photo = session.photos[session.index];
	const { secureUrl } = await rotateAsset(
		{
			publicId: photo.publicId,
			assetFolder: photo.assetFolder,
			secureUrl: photo.secureUrl,
		},
		angle,
	);

	session.photos[session.index] = { ...photo, secureUrl };
	await saveReviewSession(sessionId, session);
	return { sessionId, session };
}

export class FilmReviewSessionExpiredError extends Error {
	constructor() {
		super('This film review session expired. Re-run /film/orient to get new buttons.');
	}
}
