import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	ActionIcon,
	Box,
	Group,
	Image,
	Paper,
	SegmentedControl,
	Stack,
	Text,
} from '@mantine/core';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import type { ComposerDispatch } from '../../hooks/useInstagramComposer';
import {
	carouselDragId,
	carouselDropId,
	type DndData,
	type DndOverData,
} from '../../lib/instagram/dnd';
import { MAX_CAROUSEL_PHOTOS, type ComposerState, type PlacedPhoto, type PostAspect } from '../../lib/instagram/types';
import { colors, panelStyle } from '../../theme';

type Props = {
	state: ComposerState;
	dispatch: ComposerDispatch;
};

export function PostComposer({ state, dispatch }: Props) {
	const { post } = state;
	const aspectRatio = post.aspect === '4:5' ? '4 / 5' : '1 / 1';
	const isFull = post.photos.length >= MAX_CAROUSEL_PHOTOS;

	return (
		<Stack gap="md">
			<Paper p="md" radius="md" style={panelStyle}>
				<Stack gap="md">
					<Group justify="space-between">
						<Text size="sm" fw={600}>
							Aspect ratio
						</Text>
						<SegmentedControl
							size="xs"
							value={post.aspect}
							onChange={(value) =>
								dispatch({ type: 'SET_POST_ASPECT', aspect: value as PostAspect })
							}
							data={[
								{ value: '4:5', label: '4:5' },
								{ value: '1:1', label: '1:1' },
							]}
							color="forest"
						/>
					</Group>

					<Box
						style={{
							width: '100%',
							maxWidth: 280,
							aspectRatio,
							margin: '0 auto',
							background: colors.bgDeep,
							border: `1px solid ${colors.denimBorder}`,
							borderRadius: 8,
							overflow: 'hidden',
							display: 'grid',
							placeItems: 'center',
						}}
					>
						{post.photos.length > 0 ? (
							<Image
								src={post.photos[0].secureUrl}
								alt={post.photos[0].displayName}
								w="100%"
								h="100%"
								fit="cover"
							/>
						) : (
							<Text size="sm" c="dimmed" ta="center" px="md">
								Drag photos here to build your carousel
							</Text>
						)}
					</Box>

					<Text size="xs" c="dimmed" ta="center">
						{post.photos.length}/{MAX_CAROUSEL_PHOTOS} photos
						{isFull ? ' · maximum reached' : ''}
					</Text>
				</Stack>
			</Paper>

			<Paper p="md" radius="md" style={panelStyle}>
				<Stack gap="sm">
					<Text size="sm" fw={600}>
						Carousel order
					</Text>
					{post.photos.length === 0 ? (
						<CarouselDropZone index={0} isEmpty />
					) : (
						<Stack gap="xs">
							{post.photos.map((photo, index) => (
								<CarouselSortableItem
									key={photo.publicId}
									photo={photo}
									index={index}
									onRemove={() =>
										dispatch({ type: 'REMOVE_FROM_CAROUSEL', index })
									}
								/>
							))}
							{!isFull && <CarouselDropZone index={post.photos.length} />}
						</Stack>
					)}
				</Stack>
			</Paper>
		</Stack>
	);
}

function CarouselDropZone({ index, isEmpty }: { index: number; isEmpty?: boolean }) {
	const { setNodeRef, isOver } = useDroppable({
		id: carouselDropId(index),
		data: { kind: 'carousel', index } satisfies DndOverData,
	});

	return (
		<Box
			ref={setNodeRef}
			style={{
				border: `1px dashed ${isOver ? colors.denim : colors.panelBorder}`,
				borderRadius: 8,
				padding: isEmpty ? 24 : 8,
				textAlign: 'center',
				color: colors.textMuted,
				fontSize: 12,
				background: isOver ? 'rgba(58, 77, 98, 0.15)' : undefined,
			}}
		>
			{isEmpty ? 'Drop photos to start carousel' : 'Drop here to append'}
		</Box>
	);
}

function CarouselSortableItem({
	photo,
	index,
	onRemove,
}: {
	photo: PlacedPhoto;
	index: number;
	onRemove: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: carouselDragId(photo.publicId),
		data: { kind: 'carousel', photo, index } satisfies DndData,
	});

	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: `${carouselDropId(index)}-before`,
		data: { kind: 'carousel', index } satisfies DndOverData,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.45 : 1,
	};

	return (
		<Box ref={setDropRef}>
			<Paper
				ref={setNodeRef}
				p="xs"
				radius="sm"
				style={{
					...panelStyle,
					...style,
					border: isOver ? `1px solid ${colors.denim}` : panelStyle.border,
				}}
			>
				<Group gap="sm" wrap="nowrap">
					<ActionIcon
						variant="subtle"
						color="stone"
						size="sm"
						{...listeners}
						{...attributes}
						style={{ cursor: 'grab', touchAction: 'none' }}
						aria-label="Drag to reorder"
					>
						<IconGripVertical size={16} />
					</ActionIcon>
					<Text size="xs" c="dimmed" w={20}>
						{index + 1}
					</Text>
					<Image
						src={photo.secureUrl}
						alt={photo.displayName}
						w={48}
						h={48}
						radius="sm"
						fit="cover"
					/>
					<Text size="sm" lineClamp={1} style={{ flex: 1 }}>
						{photo.displayName}
					</Text>
					<ActionIcon
						size="sm"
						variant="subtle"
						color="stone"
						onClick={onRemove}
						aria-label="Remove from carousel"
					>
						<IconX size={14} />
					</ActionIcon>
				</Group>
			</Paper>
		</Box>
	);
}
