import { Group, Loader, SimpleGrid, Stack } from '@mantine/core';
import { BrandIcon } from '../components/BrandIcon';
import { PageHeader } from '../components/dashboard/PageHeader';
import { Row } from '../components/dashboard/Row';
import { SpotifyPlaylistLabel } from '../components/dashboard/SpotifyPlaylistLabel';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { StatusCard } from '../components/dashboard/StatusCard';
import { useAdminStatus } from '../hooks/useAdminStatus';

export function HomePage() {
	const { status, loading } = useAdminStatus();

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<PageHeader title="Overview" />

			<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
				<StatusCard title="Spotify" icon={<BrandIcon brand="spotify" size={18} />}>
					<Row label="App" value={<StatusBadge ok={status.spotify.configured} />} />
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
						label="Playlist"
						value={
							<SpotifyPlaylistLabel
								playlistName={status.spotify.playlistName}
								playlistUrl={status.spotify.playlistUrl}
							/>
						}
					/>
				</StatusCard>

				<StatusCard title="TickTick" icon={<BrandIcon brand="ticktick" size={18} />}>
					<Row label="App" value={<StatusBadge ok={status.ticktick.configured} />} />
					<Row
						label="Account"
						value={
							<StatusBadge
								ok={status.ticktick.connected}
								okLabel="Connected"
								badLabel="Not linked"
							/>
						}
					/>
					<Row
						label="Project ID"
						value={
							<StatusBadge
								ok={status.ticktick.projectIdConfigured}
								okLabel="Set"
								badLabel="Missing"
							/>
						}
					/>
				</StatusCard>

				<StatusCard title="Discord" icon={<BrandIcon brand="discord" size={18} />}>
					<Row label="Bot" value={<StatusBadge ok={status.discord.configured} />} />
				</StatusCard>

				<StatusCard title="Google Calendar" icon={<BrandIcon brand="google" size={18} />}>
					<Row label="OAuth" value={<StatusBadge ok={status.calendar.oauthConfigured} />} />
					<Row
						label="Account"
						value={
							<StatusBadge
								ok={status.calendar.connected}
								okLabel="Connected"
								badLabel="Not linked"
							/>
						}
					/>
					<Row
						label="Time off calendar"
						value={
							<StatusBadge
								ok={status.calendar.timeOffCalendarConfigured}
								okLabel="Set"
								badLabel="Missing"
							/>
						}
					/>
				</StatusCard>

				<StatusCard
					title="Film"
					icon={
						<Group gap={6}>
							<BrandIcon brand="cloudinary" size={16} />
							<BrandIcon brand="anthropic" size={16} />
						</Group>
					}
				>
					<Row
						label="Cloudinary"
						icon={<BrandIcon brand="cloudinary" size={14} />}
						value={<StatusBadge ok={status.film.cloudinaryConfigured} />}
					/>
					<Row
						label="Anthropic"
						icon={<BrandIcon brand="anthropic" size={14} />}
						value={<StatusBadge ok={status.film.anthropicConfigured} />}
					/>
				</StatusCard>
			</SimpleGrid>
		</Stack>
	);
}
