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
	/** Delivery URL after a successful rotate (for Discord links). */
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

export type OrientFolderResult = {
	folder: string;
	checked: number;
	rotated: number;
	failed: number;
	results: OrientAssetResult[];
};
