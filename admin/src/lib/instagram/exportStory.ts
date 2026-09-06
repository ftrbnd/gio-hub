import { STORY_LAYOUTS } from './layouts';
import type { StorySlide } from './types';

export const STORY_EXPORT_WIDTH = 1080;
export const STORY_EXPORT_HEIGHT = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
		img.src = url;
	});
}

/** Draw image with object-fit: cover into a destination rect. */
function drawCover(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	dx: number,
	dy: number,
	dw: number,
	dh: number,
) {
	const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
	const sw = dw / scale;
	const sh = dh / scale;
	const sx = (img.naturalWidth - sw) / 2;
	const sy = (img.naturalHeight - sh) / 2;
	ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function storyHasPhotos(slide: StorySlide): boolean {
	return slide.slots.some((slot) => slot !== null);
}

export async function renderStorySlide(slide: StorySlide): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = STORY_EXPORT_WIDTH;
	canvas.height = STORY_EXPORT_HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not create canvas context');

	ctx.fillStyle = '#12100C';
	ctx.fillRect(0, 0, STORY_EXPORT_WIDTH, STORY_EXPORT_HEIGHT);

	const slots = STORY_LAYOUTS[slide.layout];
	const photos = slide.slots;

	const images = await Promise.all(
		photos.map(async (photo) => {
			if (!photo) return null;
			return loadImage(photo.secureUrl);
		}),
	);

	slots.forEach((slot, index) => {
		const dx = Math.round(slot.x * STORY_EXPORT_WIDTH);
		const dy = Math.round(slot.y * STORY_EXPORT_HEIGHT);
		const dw = Math.round(slot.w * STORY_EXPORT_WIDTH);
		const dh = Math.round(slot.h * STORY_EXPORT_HEIGHT);
		const img = images[index];

		if (!img) {
			ctx.fillStyle = '#1C1610';
			ctx.fillRect(dx, dy, dw, dh);
			return;
		}

		drawCover(ctx, img, dx, dy, dw, dh);
	});

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Failed to encode story image'));
					return;
				}
				resolve(blob);
			},
			'image/jpeg',
			0.92,
		);
	});
}

export async function downloadStorySlide(
	slide: StorySlide,
	storyNumber: number,
): Promise<void> {
	if (!storyHasPhotos(slide)) {
		throw new Error('Add at least one photo before downloading');
	}

	const blob = await renderStorySlide(slide);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `story-${String(storyNumber).padStart(2, '0')}.jpg`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
