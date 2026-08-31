import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
	Badge,
	Button,
	Code,
	Group,
	Paper,
	SimpleGrid,
	Stack,
	Text,
	Title,
	Switch,
	List,
	Loader,
	Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import {
	getStatus,
	syncSpotify,
	setReminder,
	listProjects,
	testDiscord,
	type AdminStatus,
	type TickTickProject,
} from '../lib/api';
import { BrandIcon } from '../components/BrandIcon';
import { panelStyle, panelStyleAccent } from '../theme';

function StatusBadge({ ok, okLabel = 'Ready', badLabel = 'Missing' }: { ok: boolean; okLabel?: string; badLabel?: string }) {
	return (
		<Badge color={ok ? 'teal' : 'orange'} variant="light" size="sm">
			{ok ? okLabel : badLabel}
		</Badge>
	);
}

export function HomePage() {
	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [testingDiscord, setTestingDiscord] = useState(false);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [projects, setProjects] = useState<TickTickProject[] | null>(null);

	const refresh = useCallback(async () => {
		const next = await getStatus();
		setStatus(next);
	}, []);

	useEffect(() => {
		void refresh()
			.catch((err) => {
				notifications.show({
					color: 'forest',
					title: 'Status failed',
					message: err instanceof Error ? err.message : 'Unknown error',
				});
			})
			.finally(() => setLoading(false));
	}, [refresh]);

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<div>
				<Title order={2} c="brown.0">
					Connections
				</Title>
				<Text c="dimmed" size="sm" mt={4}>
					What’s configured on the server and what’s linked in Redis
				</Text>
			</div>

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
							status.spotify.playlistUrl ? (
								<Anchor href={status.spotify.playlistUrl} target="_blank" c="denim.3" size="sm">
									{status.spotify.monthKey}
								</Anchor>
							) : (
								<Text size="sm" c="dimmed">
									{status.spotify.monthKey}
								</Text>
							)
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

				<StatusCard
					title="Film"
					icon={
						<Group gap={6}>
							<BrandIcon brand="cloudinary" size={16} />
							<BrandIcon brand="anthropic" size={16} />
						</Group>
					}>
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

			<section>
				<Title order={2} c="brown.0" mb={4}>
					Link accounts
				</Title>
				<Text c="dimmed" size="sm" mb="md">
					Start OAuth for Spotify or TickTick using your admin session
				</Text>
				<Group>
					<Button
						component="a"
						href="/api/spotify/connect"
						color="forest"
						leftSection={<BrandIcon brand="spotify" size={18} />}
					>
						Connect Spotify
					</Button>
					<Button
						component="a"
						href="/api/ticktick/connect"
						variant="outline"
						color="stone"
						leftSection={<BrandIcon brand="ticktick" size={18} />}
					>
						Connect TickTick
					</Button>
				</Group>
			</section>

			<section>
				<Title order={2} c="brown.0" mb={4}>
					Actions
				</Title>
				<Text c="dimmed" size="sm" mb="md">
					Run the weekly Spotify sync or ping Discord
				</Text>
				<Stack gap="md">
					<Paper p="md" radius="md" style={panelStyle}>
						<Group justify="space-between" align="flex-start" wrap="wrap">
							<div>
								<Group gap="xs" mb={4}>
									<BrandIcon brand="spotify" size={20} />
									<Text fw={600}>Spotify weekly sync</Text>
								</Group>
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
						<Group justify="space-between" align="flex-start" wrap="wrap">
							<div>
								<Group gap="xs" mb={4}>
									<BrandIcon brand="discord" size={20} />
									<Text fw={600}>Discord test DM</Text>
								</Group>
								<Text size="sm" c="dimmed">
									Sends a short message to your Discord user ID
								</Text>
							</div>
							<Button
								variant="outline"
								color="stone"
								leftSection={<BrandIcon brand="discord" size={16} />}
								loading={testingDiscord}
								onClick={() => {
									setTestingDiscord(true);
									void testDiscord()
										.then(() => {
											notifications.show({
												color: 'teal',
												message: 'Test DM sent',
											});
										})
										.catch((err) => {
											notifications.show({
												color: 'orange',
												title: 'Discord failed',
												message: err instanceof Error ? err.message : 'Unknown error',
											});
										})
										.finally(() => setTestingDiscord(false));
								}}
							>
								Send test
							</Button>
						</Group>
					</Paper>
				</Stack>
			</section>

			<section>
				<Group gap="xs" mb={4}>
					<BrandIcon brand="ticktick" size={22} />
					<Title order={2} c="brown.0">
						TickTick
					</Title>
				</Group>
				<Text c="dimmed" size="sm" mb="md">
					Playlist reminder preference and project IDs for Render env
				</Text>
				<Stack gap="md">
					<Paper p="md" radius="md" style={panelStyle}>
						<Group justify="space-between">
							<div>
								<Group gap="xs" mb={4}>
									<BrandIcon brand="ticktick" size={18} />
									<Text fw={600}>Playlist reminder</Text>
								</Group>
								<Text size="sm" c="dimmed">
									{status.ticktick.reminderEnabled
										? 'On — creates a task after each Spotify sync'
										: 'Off — sync will skip TickTick tasks'}
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

					<Paper p="md" radius="md" style={panelStyle}>
						<Group justify="space-between" mb="sm">
							<div>
								<Group gap="xs" mb={4}>
									<BrandIcon brand="ticktick" size={18} />
									<Text fw={600}>Projects</Text>
								</Group>
								<Text size="sm" c="dimmed">
									Copy an id into <Code>TICKTICK_PROJECT_ID</Code>
								</Text>
							</div>
							<Button
								variant="outline"
								color="stone"
								leftSection={<BrandIcon brand="ticktick" size={16} />}
								loading={loadingProjects}
								onClick={() => {
									setLoadingProjects(true);
									void listProjects()
										.then((list) => setProjects(list))
										.catch((err) => {
											notifications.show({
												color: 'orange',
												message: err instanceof Error ? err.message : 'Load failed',
											});
										})
										.finally(() => setLoadingProjects(false));
								}}
							>
								Load projects
							</Button>
						</Group>
						{projects && (
							<List spacing="xs" size="sm">
								{projects.length === 0 ? (
									<Text c="dimmed" size="sm">
										No projects returned
									</Text>
								) : (
									projects.map((p) => (
										<List.Item key={p.id}>
											<Group justify="space-between" wrap="nowrap">
												<Text size="sm">{p.name || '(unnamed)'}</Text>
												<Code>{p.id}</Code>
											</Group>
										</List.Item>
									))
								)}
							</List>
						)}
					</Paper>
				</Stack>
			</section>
		</Stack>
	);
}

function StatusCard({
	title,
	icon,
	children,
}: {
	title: string;
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Paper p="md" radius="md" style={panelStyleAccent}>
			<Group gap="xs" mb="sm" align="center">
				{icon}
				<Text
					size="xs"
					tt="uppercase"
					fw={700}
					c="denim.3"
					style={{ letterSpacing: '0.06em' }}
				>
					{title}
				</Text>
			</Group>
			<Stack gap={8}>{children}</Stack>
		</Paper>
	);
}

function Row({
	label,
	icon,
	value,
}: {
	label: string;
	icon?: ReactNode;
	value: ReactNode;
}) {
	return (
		<Group justify="space-between">
			<Group gap={6}>
				{icon}
				<Text size="sm" c="dimmed">
					{label}
				</Text>
			</Group>
			{value}
		</Group>
	);
}
