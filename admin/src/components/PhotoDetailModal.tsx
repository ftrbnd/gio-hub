import {
	ActionIcon,
	Anchor,
	Group,
	Image,
	Modal,
	Stack,
	Text,
} from '@mantine/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { FavoriteButton } from './FavoriteButton';
import { colors, panelStyle } from '../theme';

export type PhotoDetail = {
	publicId: string;
	displayName: string;
	secureUrl: string;
	assetFolder?: string;
};

type Props = {
	photo: PhotoDetail | null;
	favorite?: boolean;
	opened: boolean;
	onClose: () => void;
	onToggleFavorite?: () => void;
	/** Optional CSS rotate for pending preview on Photos page */
	previewDegrees?: number;
};

export function PhotoDetailModal({
	photo,
	favorite = false,
	opened,
	onClose,
	onToggleFavorite,
	previewDegrees = 0,
}: Props) {
	return (
		<Modal
			opened={opened && !!photo}
			onClose={onClose}
			centered
			size="xl"
			radius="md"
			padding="md"
			withCloseButton={false}
			overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
			styles={{
				content: {
					...panelStyle,
					background: colors.panel,
				},
				body: { padding: 0 },
				header: { display: 'none' },
			}}
		>
			{photo && (
				<Stack gap="md" p="md">
					<Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
						<Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
							<Text fw={600} size="lg" lineClamp={2} title={photo.displayName}>
								{photo.displayName}
							</Text>
							{photo.assetFolder && (
								<Text size="sm" c="dimmed">
									{photo.assetFolder}
								</Text>
							)}
						</Stack>
						<Group gap={4} wrap="nowrap">
							{onToggleFavorite && (
								<FavoriteButton favorite={favorite} onToggle={onToggleFavorite} />
							)}
							<ActionIcon
								component="a"
								href={photo.secureUrl}
								target="_blank"
								rel="noreferrer"
								variant="subtle"
								color="stone"
								aria-label="Open full image"
							>
								<IconExternalLink size={16} />
							</ActionIcon>
							<ActionIcon
								variant="subtle"
								color="stone"
								onClick={onClose}
								aria-label="Close"
							>
								<IconX size={16} />
							</ActionIcon>
						</Group>
					</Group>

					<Image
						src={photo.secureUrl}
						alt={photo.displayName}
						fit="contain"
						mah="min(70vh, 720px)"
						radius="sm"
						style={{
							background: colors.bgDeep,
							transform:
								previewDegrees !== 0 ? `rotate(${previewDegrees}deg)` : undefined,
							transition: 'transform 150ms ease',
						}}
					/>

					<Anchor
						href={photo.secureUrl}
						target="_blank"
						rel="noreferrer"
						size="xs"
						c="dimmed"
						lineClamp={1}
					>
						{photo.secureUrl}
					</Anchor>
				</Stack>
			)}
		</Modal>
	);
}
