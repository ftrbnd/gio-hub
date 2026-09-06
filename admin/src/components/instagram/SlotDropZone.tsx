import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { ActionIcon, Box, Image } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { LayoutSlot } from '../../lib/instagram/types';
import type { PlacedPhoto } from '../../lib/instagram/types';
import { slotDragId, type DndData, type DndOverData } from '../../lib/instagram/dnd';
import { colors } from '../../theme';

type Props = {
	slot: LayoutSlot;
	slotIndex: number;
	slideId: string;
	photo: PlacedPhoto | null;
	onClear: () => void;
};

export function SlotDropZone({ slot, slotIndex, slideId, photo, onClear }: Props) {
	const dropId = slotDragId(slideId, slotIndex);

	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: dropId,
		data: { kind: 'slot', slideId, slotIndex } satisfies DndOverData,
	});

	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		isDragging,
	} = useDraggable({
		id: photo ? `${dropId}:photo` : `${dropId}:empty`,
		data: photo
			? ({ kind: 'slot', slideId, slotIndex, photo } satisfies DndData)
			: undefined,
		disabled: !photo,
	});

	const setRef = (node: HTMLDivElement | null) => {
		setDropRef(node);
		if (photo) setDragRef(node);
	};

	return (
		<Box
			ref={setRef}
			style={{
				position: 'absolute',
				left: `${slot.x * 100}%`,
				top: `${slot.y * 100}%`,
				width: `${slot.w * 100}%`,
				height: `${slot.h * 100}%`,
				boxSizing: 'border-box',
				border: isOver
					? `2px solid ${colors.denim}`
					: `1px solid ${colors.panelBorder}`,
				background: photo ? colors.bgDeep : 'rgba(18, 16, 12, 0.6)',
				overflow: 'hidden',
				opacity: isDragging ? 0.35 : 1,
				cursor: photo ? 'grab' : 'default',
				touchAction: 'none',
			}}
			{...(photo ? { ...listeners, ...attributes } : {})}
		>
			{photo ? (
				<>
					<Image
						src={photo.secureUrl}
						alt={photo.displayName}
						w="100%"
						h="100%"
						fit="cover"
						draggable={false}
					/>
					<ActionIcon
						size="xs"
						variant="filled"
						color="dark"
						radius="xl"
						onClick={(e) => {
							e.stopPropagation();
							onClear();
						}}
						onPointerDown={(e) => e.stopPropagation()}
						style={{
							position: 'absolute',
							top: 4,
							right: 4,
							opacity: 0.85,
						}}
						aria-label="Remove photo"
					>
						<IconX size={12} />
					</ActionIcon>
				</>
			) : (
				<Box
					style={{
						width: '100%',
						height: '100%',
						display: 'grid',
						placeItems: 'center',
						color: colors.textMuted,
						fontSize: 11,
					}}
				>
					{slotIndex + 1}
				</Box>
			)}
		</Box>
	);
}
