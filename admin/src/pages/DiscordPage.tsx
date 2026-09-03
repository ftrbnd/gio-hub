import { useState } from 'react';
import { Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BrandIcon } from '../components/BrandIcon';
import { PageHeader } from '../components/dashboard/PageHeader';
import { Row } from '../components/dashboard/Row';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { useAdminStatus } from '../hooks/useAdminStatus';
import { testDiscord } from '../lib/api';
import { panelStyle } from '../theme';

export function DiscordPage() {
	const { status, loading } = useAdminStatus();
	const [testingDiscord, setTestingDiscord] = useState(false);

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<PageHeader icon={<BrandIcon brand="discord" size={24} />} title="Discord" />

			<Paper p="md" radius="md" style={panelStyle}>
				<Row label="Bot configured" value={<StatusBadge ok={status.discord.configured} />} />
			</Paper>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between" align="flex-start" wrap="wrap">
					<div>
						<Text fw={600} mb={4}>
							Test DM
						</Text>
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
								.catch((err: unknown) => {
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
	);
}
