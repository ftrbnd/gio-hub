import { z } from 'zod';

export const OrientFolderBodySchema = z.object({
	folder: z.string().trim().min(1),
});
export type OrientFolderBody = z.infer<typeof OrientFolderBodySchema>;

export const OrientationDecisionSchema = z.object({
	rotate: z.boolean(),
	/** Clockwise degrees: 90 or -90 when rotate is true; 0 otherwise. */
	angle: z.union([z.literal(0), z.literal(90), z.literal(-90)]),
});
export type OrientationDecision = z.infer<typeof OrientationDecisionSchema>;

export type FilmAsset = {
	publicId: string;
	secureUrl: string;
	width: number;
	height: number;
	format: string;
	assetFolder: string;
};

export type OrientAssetResult = {
	publicId: string;
	rotated: boolean;
	angle: 0 | 90 | -90;
	/** True when #f4f4f5 bars were added to pad a portrait frame to 3:2. */
	padded?: boolean;
	/** Delivery URL after a successful rotate/pad (for Discord links). */
	secureUrl?: string;
	assetFolder?: string;
	error?: string;
};

export type FilmReviewPhoto = {
	publicId: string;
	assetFolder: string;
	secureUrl: string;
};

export type FilmReviewSession = {
	folder: string;
	photos: FilmReviewPhoto[];
	index: number;
	checked: number;
	failed: number;
};

export type RotateAngle = 90 | -90 | 180;

export const FilmRotatePhotoBodySchema = z.object({
	publicId: z.string().trim().min(1),
	assetFolder: z.string().trim().min(1),
	angle: z.union([z.literal(90), z.literal(-90), z.literal(180)]),
});
export type FilmRotatePhotoBody = z.infer<typeof FilmRotatePhotoBodySchema>;

export type FilmFolderSummary = {
	folder: string;
	lastUploadedAt: string;
	photoCount: number;
};

export type FilmPhotoItem = {
	publicId: string;
	displayName: string;
	secureUrl: string;
	assetFolder: string;
};

export type OrientFolderResult = {
	folder: string;
	checked: number;
	rotated: number;
	failed: number;
	results: OrientAssetResult[];
};
