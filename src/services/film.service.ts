import { randomBytes } from 'node:crypto';
import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
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

export async function rotateAsset(
	asset: Pick<FilmAsset, 'publicId' | 'assetFolder'>,
	angle: RotateAngle,
): Promise<string> {
	ensureCloudinaryConfigured();

	const sourceUrl = cloudinary.url(asset.publicId, {
		secure: true,
		resource_type: 'image',
		type: 'upload',
		transformation: [{ angle }],
	});

	const result = await cloudinary.uploader.upload(sourceUrl, {
		public_id: asset.publicId,
		overwrite: true,
		invalidate: true,
		asset_folder: asset.assetFolder,
		use_filename: true,
		unique_filename: false,
	});

	return result.secure_url;
}

async function orientOneAsset(asset: FilmAsset): Promise<OrientAssetResult> {
	try {
		const decision = await detectOrientation(asset);
		if (!decision.rotate || decision.angle === 0) {
			return { publicId: asset.publicId, rotated: false, angle: 0 };
		}

		const secureUrl = await rotateAsset(asset, decision.angle);
		return {
			publicId: asset.publicId,
			rotated: true,
			angle: decision.angle,
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
			Boolean(r.rotated && r.secureUrl && r.assetFolder),
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
					label: '90° CW',
					style: ButtonStyleTypes.PRIMARY,
				},
				{
					type: MessageComponentTypes.BUTTON,
					custom_id: `film:rot:-90:${sessionId}`,
					label: '90° CCW',
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
		description: `Rotated **${session.photos.length}** ${photoWord} in \`${session.folder}\` (${session.checked} checked${failedNote}).`,
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
	const secureUrl = await rotateAsset(
		{ publicId: photo.publicId, assetFolder: photo.assetFolder },
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
