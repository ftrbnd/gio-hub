import { Anchor, Badge, Group, Text } from '@mantine/core';
import { IconPlaylistOff } from '@tabler/icons-react';

type Props = {
	playlistName: string;
	playlistUrl: string | null;
};

export function SpotifyPlaylistLabel({ playlistName, playlistUrl }: Props) {
	if (playlistUrl) {
		return (
			<Anchor href={playlistUrl} target="_blank" c="denim.3" size="sm">
				{playlistName}
			</Anchor>
		);
	}

	return (
		<Group gap={8} wrap="nowrap">
			<Text size="sm" c="dimmed" td="line-through">
				{playlistName}
			</Text>
			<Badge
				color="orange"
				variant="light"
				size="sm"
				leftSection={<IconPlaylistOff size={12} />}
			>
				Not created yet
			</Badge>
		</Group>
	);
}
