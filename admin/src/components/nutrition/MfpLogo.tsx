import mfpMark from '../../assets/myfitnesspal.png';

/** MyFitnessPal brand blue (#0066EE). */
export const MFP_BLUE = '#0066EE';

type Props = {
	size?: number;
};

export function MfpLogo({ size = 16 }: Props) {
	return (
		<img
			src={mfpMark}
			alt=""
			width={size}
			height={size}
			decoding="async"
			draggable={false}
			style={{
				display: 'block',
				borderRadius: Math.max(3, Math.round(size * 0.22)),
				flexShrink: 0,
			}}
		/>
	);
}
