import { slotCountForLayout } from './layouts';
import {
	MAX_CAROUSEL_PHOTOS,
	type ComposerMode,
	type ComposerState,
	type PlacedPhoto,
	type PostAspect,
	type StoryLayout,
	type StorySlide,
} from './types';

export const DRAFT_STORAGE_KEY = 'instagram-composer-draft';

export function createStorySlide(layout: StoryLayout = 2): StorySlide {
	const count = slotCountForLayout(layout);
	return {
		id: crypto.randomUUID(),
		layout,
		slots: Array.from({ length: count }, () => null),
	};
}

export const initialComposerState: ComposerState = {
	mode: 'stories',
	folder: null,
	activeStoryIndex: 0,
	stories: [createStorySlide(2)],
	post: { aspect: '4:5', photos: [] },
};

function resizeSlots(
	slots: (PlacedPhoto | null)[],
	layout: StoryLayout,
): (PlacedPhoto | null)[] {
	const count = slotCountForLayout(layout);
	const next = slots.slice(0, count);
	while (next.length < count) next.push(null);
	return next;
}

function updateSlide(
	stories: StorySlide[],
	slideId: string,
	updater: (slide: StorySlide) => StorySlide,
): StorySlide[] {
	return stories.map((slide) => (slide.id === slideId ? updater(slide) : slide));
}

export type ComposerAction =
	| { type: 'SET_MODE'; mode: ComposerMode }
	| { type: 'SET_FOLDER'; folder: string | null }
	| { type: 'SET_ACTIVE_STORY'; index: number }
	| { type: 'ADD_STORY' }
	| { type: 'REMOVE_STORY'; slideId: string }
	| { type: 'SET_STORY_LAYOUT'; slideId: string; layout: StoryLayout }
	| { type: 'PLACE_IN_SLOT'; slideId: string; slotIndex: number; photo: PlacedPhoto }
	| { type: 'PLACE_NEXT'; photo: PlacedPhoto }
	| { type: 'CLEAR_SLOT'; slideId: string; slotIndex: number }
	| { type: 'SWAP_SLOTS'; slideId: string; from: number; to: number }
	| { type: 'SET_POST_ASPECT'; aspect: PostAspect }
	| { type: 'ADD_TO_CAROUSEL'; photo: PlacedPhoto; index?: number }
	| { type: 'REMOVE_FROM_CAROUSEL'; index: number }
	| { type: 'REORDER_CAROUSEL'; from: number; to: number }
	| { type: 'RESET' }
	| { type: 'HYDRATE'; state: ComposerState };

export function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case 'SET_MODE':
			return { ...state, mode: action.mode };

		case 'SET_FOLDER':
			return { ...state, folder: action.folder };

		case 'SET_ACTIVE_STORY':
			return {
				...state,
				activeStoryIndex: Math.min(
					Math.max(0, action.index),
					Math.max(0, state.stories.length - 1),
				),
			};

		case 'ADD_STORY': {
			const stories = [...state.stories, createStorySlide(2)];
			return { ...state, stories, activeStoryIndex: stories.length - 1 };
		}

		case 'REMOVE_STORY': {
			if (state.stories.length <= 1) return state;
			const stories = state.stories.filter((s) => s.id !== action.slideId);
			const activeStoryIndex = Math.min(state.activeStoryIndex, stories.length - 1);
			return { ...state, stories, activeStoryIndex };
		}

		case 'SET_STORY_LAYOUT':
			return {
				...state,
				stories: updateSlide(state.stories, action.slideId, (slide) => ({
					...slide,
					layout: action.layout,
					slots: resizeSlots(slide.slots, action.layout),
				})),
			};

		case 'PLACE_IN_SLOT':
			return {
				...state,
				stories: updateSlide(state.stories, action.slideId, (slide) => {
					const slots = [...slide.slots];
					slots[action.slotIndex] = action.photo;
					return { ...slide, slots };
				}),
			};

		case 'PLACE_NEXT': {
			if (state.mode === 'post') {
				return composerReducer(state, {
					type: 'ADD_TO_CAROUSEL',
					photo: action.photo,
				});
			}

			const active = state.stories[state.activeStoryIndex];
			if (!active) return state;

			const emptyIndex = active.slots.findIndex((slot) => slot === null);
			if (emptyIndex === -1) return state;

			return composerReducer(state, {
				type: 'PLACE_IN_SLOT',
				slideId: active.id,
				slotIndex: emptyIndex,
				photo: action.photo,
			});
		}

		case 'CLEAR_SLOT':
			return {
				...state,
				stories: updateSlide(state.stories, action.slideId, (slide) => {
					const slots = [...slide.slots];
					slots[action.slotIndex] = null;
					return { ...slide, slots };
				}),
			};

		case 'SWAP_SLOTS':
			return {
				...state,
				stories: updateSlide(state.stories, action.slideId, (slide) => {
					const slots = [...slide.slots];
					const temp = slots[action.from];
					slots[action.from] = slots[action.to] ?? null;
					slots[action.to] = temp ?? null;
					return { ...slide, slots };
				}),
			};

		case 'SET_POST_ASPECT':
			return { ...state, post: { ...state.post, aspect: action.aspect } };

		case 'ADD_TO_CAROUSEL': {
			if (state.post.photos.length >= MAX_CAROUSEL_PHOTOS) return state;
			if (state.post.photos.some((p) => p.publicId === action.photo.publicId)) {
				return state;
			}
			const photos = [...state.post.photos];
			const index =
				action.index === undefined
					? photos.length
					: Math.min(Math.max(0, action.index), photos.length);
			photos.splice(index, 0, action.photo);
			return {
				...state,
				post: { ...state.post, photos: photos.slice(0, MAX_CAROUSEL_PHOTOS) },
			};
		}

		case 'REMOVE_FROM_CAROUSEL': {
			const photos = state.post.photos.filter((_, i) => i !== action.index);
			return { ...state, post: { ...state.post, photos } };
		}

		case 'REORDER_CAROUSEL': {
			const photos = [...state.post.photos];
			const [moved] = photos.splice(action.from, 1);
			if (!moved) return state;
			photos.splice(action.to, 0, moved);
			return { ...state, post: { ...state.post, photos } };
		}

		case 'RESET':
			return { ...initialComposerState };

		case 'HYDRATE':
			return action.state;

		default:
			return state;
	}
}

export function loadDraft(): ComposerState | null {
	try {
		const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
		if (!raw) return null;
		return normalizeDraft(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function normalizeDraft(value: unknown): ComposerState | null {
	if (!value || typeof value !== 'object') return null;
	const parsed = value as ComposerState & { music?: unknown };
	if (!Array.isArray(parsed.stories) || !parsed.post) return null;
	const { music: _music, ...rest } = parsed;
	return {
		...initialComposerState,
		...rest,
		stories: rest.stories.length > 0 ? rest.stories : initialComposerState.stories,
		post: parsed.post,
		activeStoryIndex: Math.min(
			Math.max(0, rest.activeStoryIndex ?? 0),
			Math.max(0, (rest.stories?.length ?? 1) - 1),
		),
	};
}

export function saveDraft(state: ComposerState): void {
	try {
		localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
	} catch {
		// ignore quota errors
	}
}

export function clearLocalDraft(): void {
	try {
		localStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch {
		// ignore
	}
}
