import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Box, Group, Image, Paper, Text } from '@mantine/core';
import { FavoriteButton } from '../FavoriteButton';
import { PhotoDetailButton } from '../PhotoDetailButton';
import type { PlacedPhoto } from '../../lib/instagram/types';
import { libraryDragId, type DndData } from '../../lib/instagram/dnd';
import { colors, panelStyle } from '../../theme';

export function DraggableLibraryPhoto({
	photo,
	disabled,
	favorite,
	onClick,
	onToggleFavorite,
	onOpenDetail,
}: {
	photo: PlacedPhoto;
	disabled?: boolean;
	favorite?: boolean;
	onClick?: () => void;
	onToggleFavorite?: () => void;
	onOpenDetail?: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: libraryDragId(photo.publicId),
		data: { kind: 'library', photo } satisfies DndData,
		disabled,
	});

	const style = {
		transform: CSS.Translate.toString(transform),
		opacity: isDragging ? 0.4 : 1,
		cursor: disabled ? 'not-allowed' : 'grab',
		touchAction: 'none' as const,
	};

	return (
		<Paper
			ref={setNodeRef}
			p={4}
			radius="sm"
			style={{
				...panelStyle,
				...style,
				background: colors.bgDeep,
				position: 'relative',
			}}
			{...listeners}
			{...attributes}
			onClick={() => {
				if (disabled || isDragging) return;
				onClick?.();
			}}
		>
			<Box style={{ position: 'relative' }}>
				<Image
					src={photo.secureUrl}
					alt={photo.displayName}
					h={72}
					fit="contain"
					radius="sm"
					style={{ background: colors.bgDeep }}
				/>
				{(onToggleFavorite || onOpenDetail) && (
					<Group
						gap={2}
						wrap="nowrap"
						style={{
							position: 'absolute',
							top: 2,
							right: 2,
						}}
					>
						{onOpenDetail && (
							<PhotoDetailButton size="xs" onOpen={onOpenDetail} />
						)}
						{onToggleFavorite && (
							<FavoriteButton
								favorite={Boolean(favorite)}
								size="xs"
								onToggle={onToggleFavorite}
							/>
						)}
					</Group>
				)}
			</Box>
			<Group gap={4} wrap="nowrap" mt={4} justify="space-between">
				<Text size="xs" c="dimmed" lineClamp={1} title={photo.displayName} style={{ flex: 1 }}>
					{photo.displayName}
				</Text>
			</Group>
		</Paper>
	);
}

export function LibraryPhotoOverlay({ photo }: { photo: PlacedPhoto }) {
	return (
		<Paper
			p={4}
			radius="sm"
			style={{
				...panelStyle,
				background: colors.bgDeep,
				boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
				width: 96,
			}}
		>
			<Image
				src={photo.secureUrl}
				alt={photo.displayName}
				h={72}
				fit="cover"
				radius="sm"
			/>
		</Paper>
	);
}
