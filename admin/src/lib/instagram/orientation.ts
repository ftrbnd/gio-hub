/** Pad bar colors written by film orient (current + prior pure white). */
const PAD_COLORS = [
	{ r: 244, g: 244, b: 245 }, // #f4f4f5
	{ r: 255, g: 255, b: 255 },
] as const;
const PAD_COLOR_TOLERANCE = 14;
const BAR_COLUMN_MATCH_RATIO = 0.95;
const MIN_BAR_WIDTH_RATIO = 0.02;
const MAX_DETECT_WIDTH = 400;

function isPadPixel(r: number, g: number, b: number): boolean {
	return PAD_COLORS.some(
		(c) =>
			Math.abs(r - c.r) <= PAD_COLOR_TOLERANCE &&
			Math.abs(g - c.g) <= PAD_COLOR_TOLERANCE &&
			Math.abs(b - c.b) <= PAD_COLOR_TOLERANCE,
	);
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image for orientation: ${url}`));
		img.src = url;
	});
}

/**
 * Portrait film frames are stored as landscape with vertical #f4f4f5 side bars.
 * Returns true when those bars are detected.
 */
export async function hasVerticalPadBars(imageUrl: string): Promise<boolean> {
	const img = await loadImage(imageUrl);
	const fullWidth = img.naturalWidth;
	const fullHeight = img.naturalHeight;
	if (fullWidth <= 0 || fullHeight <= 0) return false;
	// Side bars only appear on landscape canvases (padded portraits).
	if (fullWidth <= fullHeight) return false;

	const scale = Math.min(1, MAX_DETECT_WIDTH / fullWidth);
	const width = Math.max(1, Math.round(fullWidth * scale));
	const height = Math.max(1, Math.round(fullHeight * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return false;

	ctx.drawImage(img, 0, 0, width, height);
	const { data } = ctx.getImageData(0, 0, width, height);
	const step = Math.max(1, Math.floor(height / 120));

	function columnIsBar(x: number): boolean {
		let match = 0;
		let samples = 0;
		for (let y = 0; y < height; y += step) {
			const i = (y * width + x) * 4;
			samples++;
			if (isPadPixel(data[i], data[i + 1], data[i + 2])) match++;
		}
		return samples > 0 && match / samples >= BAR_COLUMN_MATCH_RATIO;
	}

	let left = 0;
	const maxBar = Math.floor(width / 3);
	while (left < maxBar && columnIsBar(left)) left++;

	let right = 0;
	while (right < maxBar && columnIsBar(width - 1 - right)) right++;

	const minBar = Math.max(2, Math.round(width * MIN_BAR_WIDTH_RATIO));
	if (left < minBar || right < minBar) return false;
	// Letterboxing should be roughly symmetric.
	if (Math.abs(left - right) > Math.max(left, right) * 0.3) return false;

	return true;
}

export type PhotoOrientation = 'vertical' | 'horizontal';

export async function detectPhotoOrientation(
	imageUrl: string,
): Promise<PhotoOrientation> {
	try {
		const vertical = await hasVerticalPadBars(imageUrl);
		return vertical ? 'vertical' : 'horizontal';
	} catch {
		return 'horizontal';
	}
}
