import { useState } from 'react';
import {
	Button,
	Code,
	Group,
	List,
	Loader,
	Paper,
	Stack,
	Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BrandIcon } from '../components/BrandIcon';
import { ConnectButton } from '../components/dashboard/ConnectButton';
import { PageHeader } from '../components/dashboard/PageHeader';
import { Row } from '../components/dashboard/Row';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { useAdminStatus } from '../hooks/useAdminStatus';
import { listProjects } from '../lib/api';
import { panelStyle } from '../theme';

export function TickTickPage() {
	const { status, loading } = useAdminStatus();
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null);

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<PageHeader icon={<BrandIcon brand="ticktick" size={24} />} title="TickTick" />

			<Paper p="md" radius="md" style={panelStyle}>
				<Stack gap="sm">
					<Row label="App configured" value={<StatusBadge ok={status.ticktick.configured} />} />
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
				</Stack>
			</Paper>

			<ConnectButton
				connected={status.ticktick.connected}
				href="/api/ticktick/connect"
				serviceName="TickTick"
				icon={<BrandIcon brand="ticktick" size={18} />}
				variant="outline"
				color="stone"
			/>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between" mb="sm">
					<div>
						<Text fw={600} mb={4}>
							Projects
						</Text>
						<Text size="sm" c="dimmed">
							Copy an id into <Code>TICKTICK_PROJECT_ID</Code> or{' '}
							<Code>TICKTICK_TIME_OFF_PROJECT_ID</Code>
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
	);
}
