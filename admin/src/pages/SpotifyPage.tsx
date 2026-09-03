import { useState } from 'react';
import { Button, Group, Loader, Paper, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { BrandIcon } from '../components/BrandIcon';
import { ConnectButton } from '../components/dashboard/ConnectButton';
import { PageHeader } from '../components/dashboard/PageHeader';
import { SpotifyPlaylistLabel } from '../components/dashboard/SpotifyPlaylistLabel';
import { Row } from '../components/dashboard/Row';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { useAdminStatus } from '../hooks/useAdminStatus';
import { setReminder, syncSpotify } from '../lib/api';
import { panelStyle } from '../theme';

export function SpotifyPage() {
	const { status, loading, refresh } = useAdminStatus();
	const [syncing, setSyncing] = useState(false);

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<PageHeader icon={<BrandIcon brand="spotify" size={24} />} title="Spotify" />

			<Paper p="md" radius="md" style={panelStyle}>
				<Stack gap="sm">
					<Row label="App configured" value={<StatusBadge ok={status.spotify.configured} />} />
					<Row
						label="Account"
						value={
							<StatusBadge
								ok={status.spotify.connected}
								okLabel="Connected"
								badLabel="Not linked"
							/>
						}
					/>
					<Row
						label="Current playlist"
						value={
							<SpotifyPlaylistLabel
								playlistName={status.spotify.playlistName}
								playlistUrl={status.spotify.playlistUrl}
							/>
						}
					/>
				</Stack>
			</Paper>

			<ConnectButton
				connected={status.spotify.connected}
				href="/api/spotify/connect"
				serviceName="Spotify"
				icon={<BrandIcon brand="spotify" size={18} />}
			/>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between" align="flex-start" wrap="wrap">
					<div>
						<Text fw={600} mb={4}>
							Weekly sync
						</Text>
						<Text size="sm" c="dimmed">
							Pulls top tracks, updates the monthly playlist, optional TickTick + Discord
						</Text>
					</div>
					<Button
						color="forest"
						leftSection={<IconRefresh size={16} />}
						loading={syncing}
						onClick={() => {
							setSyncing(true);
							void syncSpotify()
								.then((result) => {
									notifications.show({
										color: 'teal',
										title: `Sync ${result.month}`,
										message: `Added ${result.added.length} · Discord ${result.discordMessageSent} · TickTick ${result.ticktickTaskCreated}`,
									});
									return refresh();
								})
								.catch((err) => {
									notifications.show({
										color: 'orange',
										title: 'Sync failed',
										message: err instanceof Error ? err.message : 'Unknown error',
									});
								})
								.finally(() => setSyncing(false));
						}}
					>
						Run sync
					</Button>
				</Group>
			</Paper>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between">
					<div>
						<Group gap="xs" mb={4}>
							<BrandIcon brand="ticktick" size={18} />
							<Text fw={600}>TickTick playlist reminder</Text>
						</Group>
						<Text size="sm" c="dimmed">
							{status.ticktick.reminderEnabled
								? 'On — creates a task after each sync'
								: 'Off — sync will skip the TickTick task'}
						</Text>
					</div>
					<Switch
						color="forest"
						checked={status.ticktick.reminderEnabled}
						onChange={(e) => {
							const enabled = e.currentTarget.checked;
							void setReminder(enabled)
								.then(() => refresh())
								.catch((err) => {
									notifications.show({
										color: 'orange',
										message: err instanceof Error ? err.message : 'Update failed',
									});
								});
						}}
					/>
				</Group>
			</Paper>
		</Stack>
	);
}
