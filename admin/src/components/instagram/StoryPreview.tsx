import { Box } from '@mantine/core';
import { STORY_LAYOUTS } from '../../lib/instagram/layouts';
import type { StorySlide } from '../../lib/instagram/types';
import { SlotDropZone } from './SlotDropZone';
import { colors } from '../../theme';

type Props = {
	slide: StorySlide;
	onClearSlot: (slotIndex: number) => void;
};

export function StoryPreview({ slide, onClearSlot }: Props) {
	const slots = STORY_LAYOUTS[slide.layout];

	return (
		<Box
			style={{
				position: 'relative',
				width: '100%',
				maxWidth: 280,
				aspectRatio: '9 / 16',
				margin: '0 auto',
				background: colors.bgDeep,
				border: `1px solid ${colors.denimBorder}`,
				borderRadius: 8,
				overflow: 'hidden',
			}}
		>
			{slots.map((slot, index) => (
				<SlotDropZone
					key={index}
					slot={slot}
					slotIndex={index}
					slideId={slide.id}
					photo={slide.slots[index] ?? null}
					onClear={() => onClearSlot(index)}
				/>
			))}
		</Box>
	);
}
