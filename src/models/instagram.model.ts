import { z } from 'zod';

const PlacedPhotoSchema = z.object({
	publicId: z.string().min(1),
	secureUrl: z.string().min(1),
	displayName: z.string(),
	assetFolder: z.string(),
});

const StorySlideSchema = z.object({
	id: z.string().min(1),
	layout: z.union([
		z.literal(2),
		z.literal(3),
		z.literal(4),
		z.literal(6),
	]),
	slots: z.array(PlacedPhotoSchema.nullable()),
});

const PostCarouselSchema = z.object({
	aspect: z.union([z.literal('4:5'), z.literal('1:1')]),
	photos: z.array(PlacedPhotoSchema).max(20),
});

export const InstagramComposerDraftSchema = z.object({
	mode: z.union([z.literal('stories'), z.literal('post')]),
	folder: z.string().nullable(),
	activeStoryIndex: z.number().int().nonnegative(),
	stories: z.array(StorySlideSchema).min(1),
	post: PostCarouselSchema,
});

export type InstagramComposerDraft = z.infer<typeof InstagramComposerDraftSchema>;
