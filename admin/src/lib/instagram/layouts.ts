import type { LayoutSlot, StoryLayout } from './types';

export const STORY_LAYOUTS: Record<StoryLayout, LayoutSlot[]> = {
	2: [
		{ x: 0, y: 0, w: 1, h: 0.5 },
		{ x: 0, y: 0.5, w: 1, h: 0.5 },
	],
	3: [
		{ x: 0, y: 0, w: 1, h: 0.5 },
		{ x: 0, y: 0.5, w: 0.5, h: 0.5 },
		{ x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
	],
	4: [
		{ x: 0, y: 0, w: 0.5, h: 0.5 },
		{ x: 0.5, y: 0, w: 0.5, h: 0.5 },
		{ x: 0, y: 0.5, w: 0.5, h: 0.5 },
		{ x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
	],
	6: [
		{ x: 0, y: 0, w: 0.5, h: 1 / 3 },
		{ x: 0.5, y: 0, w: 0.5, h: 1 / 3 },
		{ x: 0, y: 1 / 3, w: 0.5, h: 1 / 3 },
		{ x: 0.5, y: 1 / 3, w: 0.5, h: 1 / 3 },
		{ x: 0, y: 2 / 3, w: 0.5, h: 1 / 3 },
		{ x: 0.5, y: 2 / 3, w: 0.5, h: 1 / 3 },
	],
};

export const STORY_LAYOUT_OPTIONS: StoryLayout[] = [2, 3, 4, 6];

export function slotCountForLayout(layout: StoryLayout): number {
	return STORY_LAYOUTS[layout].length;
}
