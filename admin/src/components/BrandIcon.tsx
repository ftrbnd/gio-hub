import {
	siAnthropic,
	siCloudinary,
	siDiscord,
	siGoogle,
	siSpotify,
	siTicktick,
} from 'simple-icons';

const brands = {
	spotify: siSpotify,
	discord: siDiscord,
	ticktick: siTicktick,
	cloudinary: siCloudinary,
	anthropic: siAnthropic,
	google: siGoogle,
} as const;

export type BrandName = keyof typeof brands;

export function BrandIcon({
	brand,
	size = 20,
	monochrome = false,
}: {
	brand: BrandName;
	size?: number;
	monochrome?: boolean;
}) {
	const icon = brands[brand];

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={monochrome ? 'currentColor' : `#${icon.hex}`}
			aria-hidden
		>
			<title>{icon.title}</title>
			<path d={icon.path} />
		</svg>
	);
}
