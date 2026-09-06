import type { FilmPhotoItem } from '../api';

export type ComposerMode = 'stories' | 'post';

export type StoryLayout = 2 | 3 | 4 | 6;

export type PostAspect = '4:5' | '1:1';

export type PlacedPhoto = {
	publicId: string;
	secureUrl: string;
	displayName: string;
	assetFolder: string;
};

export type StorySlide = {
	id: string;
	layout: StoryLayout;
	slots: (PlacedPhoto | null)[];
};

export type PostCarousel = {
	aspect: PostAspect;
	photos: PlacedPhoto[];
};

export type ComposerState = {
	mode: ComposerMode;
	folder: string | null;
	activeStoryIndex: number;
	stories: StorySlide[];
	post: PostCarousel;
};

export type LayoutSlot = {
	x: number;
	y: number;
	w: number;
	h: number;
};

export type DragSource =
	| { type: 'library'; photo: PlacedPhoto }
	| { type: 'slot'; slideId: string; slotIndex: number; photo: PlacedPhoto }
	| { type: 'carousel'; photo: PlacedPhoto; index: number };

export type DropTarget =
	| { type: 'slot'; slideId: string; slotIndex: number }
	| { type: 'carousel'; index: number };

export const MAX_CAROUSEL_PHOTOS = 20;

export function toPlacedPhoto(photo: FilmPhotoItem): PlacedPhoto {
	return {
		publicId: photo.publicId,
		secureUrl: photo.secureUrl,
		displayName: photo.displayName,
		assetFolder: photo.assetFolder,
	};
}
