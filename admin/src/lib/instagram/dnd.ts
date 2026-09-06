import type { DragSource, DropTarget, PlacedPhoto } from './types';

export function libraryDragId(publicId: string): string {
	return `library:${publicId}`;
}

export function slotDragId(slideId: string, slotIndex: number): string {
	return `slot:${slideId}:${slotIndex}`;
}

export function carouselDragId(publicId: string): string {
	return `carousel:${publicId}`;
}

export function carouselDropId(index: number): string {
	return `carousel-drop:${index}`;
}

export type DndData =
	| { kind: 'library'; photo: PlacedPhoto }
	| { kind: 'slot'; slideId: string; slotIndex: number; photo: PlacedPhoto }
	| { kind: 'carousel'; photo: PlacedPhoto; index: number };

export type DndOverData =
	| { kind: 'slot'; slideId: string; slotIndex: number }
	| { kind: 'carousel'; index: number };

export function isDndData(value: unknown): value is DndData {
	if (!value || typeof value !== 'object') return false;
	return 'kind' in value;
}

export function isDndOverData(value: unknown): value is DndOverData {
	if (!value || typeof value !== 'object') return false;
	return 'kind' in value;
}

export function dragSourceFromData(data: DndData): DragSource {
	switch (data.kind) {
		case 'library':
			return { type: 'library', photo: data.photo };
		case 'slot':
			return {
				type: 'slot',
				slideId: data.slideId,
				slotIndex: data.slotIndex,
				photo: data.photo,
			};
		case 'carousel':
			return { type: 'carousel', photo: data.photo, index: data.index };
	}
}

export function dropTargetFromData(data: DndOverData): DropTarget {
	switch (data.kind) {
		case 'slot':
			return { type: 'slot', slideId: data.slideId, slotIndex: data.slotIndex };
		case 'carousel':
			return { type: 'carousel', index: data.index };
	}
}
