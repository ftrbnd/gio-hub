import { z } from 'zod';

const nullableNumber = z.number().finite().nullable();

export const NutritionResultSchema = z.object({
	title: z.string().min(1),
	calories: nullableNumber,
	totalFatG: nullableNumber,
	saturatedFatG: nullableNumber,
	polyunsaturatedFatG: nullableNumber,
	monounsaturatedFatG: nullableNumber,
	transFatG: nullableNumber,
	cholesterolMg: nullableNumber,
	sodiumMg: nullableNumber,
	potassiumMg: nullableNumber,
	totalCarbsG: nullableNumber,
	dietaryFiberG: nullableNumber,
	sugarsG: nullableNumber,
	addedSugarsG: nullableNumber,
	proteinG: nullableNumber,
	vitaminAPct: nullableNumber,
	vitaminCPct: nullableNumber,
	calciumPct: nullableNumber,
	ironPct: nullableNumber,
	vitaminDPct: nullableNumber,
	sourcesExplanation: z.string().min(1),
});
export type NutritionResult = z.infer<typeof NutritionResultSchema>;

/** Older Redis results may omit title — accept and fill later. */
export const NutritionResultStoredSchema = NutritionResultSchema.extend({
	title: z.string().min(1).optional(),
});

export const NutritionStatusSchema = z.enum([
	'idle',
	'calculating',
	'ready',
	'error',
]);
export type NutritionStatus = z.infer<typeof NutritionStatusSchema>;

export const NutritionItemSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	status: NutritionStatusSchema,
	errorMessage: z.string().nullable().optional(),
	result: NutritionResultStoredSchema.nullable().optional(),
});
export type NutritionItem = z.infer<typeof NutritionItemSchema>;

export const NutritionPhotoSchema = z.object({
	url: z.string().min(1),
	publicId: z.string().min(1),
});
export type NutritionPhoto = z.infer<typeof NutritionPhotoSchema>;

export const MAX_NUTRITION_PHOTOS = 10;

export const NutritionEntrySchema = z.object({
	id: z.string().min(1),
	query: z.string(),
	restaurant: z.string().nullable().optional(),
	title: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	photos: z.array(NutritionPhotoSchema).max(MAX_NUTRITION_PHOTOS).default([]),
	/** Thumbnail mirror of photos[0] for display + Claude. */
	photoUrl: z.string().nullable().optional(),
	photoPublicId: z.string().nullable().optional(),
	items: z.array(NutritionItemSchema).default([]),
	status: NutritionStatusSchema,
	errorMessage: z.string().nullable().optional(),
	/** @deprecated Legacy single-item result; migrated into items on read. */
	result: NutritionResultStoredSchema.nullable().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});
export type NutritionEntry = z.infer<typeof NutritionEntrySchema>;

export const CreateNutritionEntryBodySchema = z.object({
	query: z.string().optional(),
});

export const PatchNutritionEntryBodySchema = z
	.object({
		query: z.string().optional(),
		restaurant: z.string().nullable().optional(),
		description: z.string().nullable().optional(),
		website: z.string().nullable().optional(),
	})
	.refine(
		(body) =>
			body.query !== undefined ||
			body.restaurant !== undefined ||
			body.description !== undefined ||
			body.website !== undefined,
		{ message: 'At least one field is required' },
	);

export const MealParseSchema = z.object({
	restaurant: z.string().nullable(),
	items: z.array(z.string().min(1)).min(1),
});
export type MealParse = z.infer<typeof MealParseSchema>;

export const AllowedNutritionImageTypeSchema = z.enum([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
]);
export type AllowedNutritionImageType = z.infer<
	typeof AllowedNutritionImageTypeSchema
>;
