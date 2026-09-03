import { useCallback, useEffect, useState } from 'react';
import {
	Badge,
	Button,
	Code,
	Group,
	List,
	Loader,
	Paper,
	Stack,
	Table,
	Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { BrandIcon } from '../components/BrandIcon';
import { ConnectButton } from '../components/dashboard/ConnectButton';
import { PageHeader } from '../components/dashboard/PageHeader';
import { Row } from '../components/dashboard/Row';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { useAdminStatus } from '../hooks/useAdminStatus';
import {
	listCalendars,
	listTimeOffEvents,
	markTimeOffCompleted,
	syncTimeOff,
	type TimeOffEvent,
} from '../lib/api';
import { formatReminderDueDate } from '../lib/timeOff';
import { panelStyle } from '../theme';

export function TimeOffPage() {
	const { status, loading } = useAdminStatus();
	const [loadingCalendars, setLoadingCalendars] = useState(false);
	const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[] | null>(null);
	const [loadingTimeOffEvents, setLoadingTimeOffEvents] = useState(false);
	const [timeOffEvents, setTimeOffEvents] = useState<TimeOffEvent[] | null>(null);
	const [syncingTimeOff, setSyncingTimeOff] = useState(false);
	const [markingEventId, setMarkingEventId] = useState<string | null>(null);

	const loadTimeOffEvents = useCallback(async () => {
		setLoadingTimeOffEvents(true);
		try {
			const { events } = await listTimeOffEvents();
			setTimeOffEvents(events);
		} catch (err) {
			notifications.show({
				color: 'orange',
				title: 'Time off events failed',
				message: err instanceof Error ? err.message : 'Unknown error',
			});
		} finally {
			setLoadingTimeOffEvents(false);
		}
	}, []);

	useEffect(() => {
		void loadTimeOffEvents();
	}, [loadTimeOffEvents]);

	if (loading || !status) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	return (
		<Stack gap="xl">
			<PageHeader icon={<BrandIcon brand="google" size={24} />} title="Time off" />

			<Paper p="md" radius="md" style={panelStyle}>
				<Stack gap="sm">
					<Row label="OAuth" value={<StatusBadge ok={status.calendar.oauthConfigured} />} />
					<Row
						label="Calendar connected"
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
					<Row
						label="TickTick project"
						value={
							<StatusBadge
								ok={status.ticktick.timeOffProjectIdConfigured}
								okLabel="Set"
								badLabel="Missing"
							/>
						}
					/>
				</Stack>
			</Paper>

			<ConnectButton
				connected={status.calendar.connected}
				href="/api/calendar/connect"
				serviceName="Google Calendar"
				icon={<BrandIcon brand="google" size={18} />}
				variant="outline"
				color="stone"
			/>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between" mb="sm">
					<div>
						<Text fw={600} mb={4}>
							Calendars
						</Text>
						<Text size="sm" c="dimmed">
							Copy an id into <Code>GOOGLE_TIME_OFF_CALENDAR_ID</Code>
						</Text>
					</div>
					<Button
						variant="outline"
						color="stone"
						leftSection={<BrandIcon brand="google" size={16} />}
						loading={loadingCalendars}
						onClick={() => {
							setLoadingCalendars(true);
							void listCalendars()
								.then((list) => setCalendars(list))
								.catch((err) => {
									notifications.show({
										color: 'orange',
										message: err instanceof Error ? err.message : 'Load failed',
									});
								})
								.finally(() => setLoadingCalendars(false));
						}}
					>
						Load calendars
					</Button>
				</Group>
				{calendars && (
					<List spacing="xs" size="sm">
						{calendars.length === 0 ? (
							<Text c="dimmed" size="sm">
								No calendars returned
							</Text>
						) : (
							calendars.map((calendar) => (
								<List.Item key={calendar.id}>
									<Group justify="space-between" wrap="nowrap">
										<Text size="sm">
											{calendar.summary}
											{calendar.primary ? ' (primary)' : ''}
										</Text>
										<Code>{calendar.id}</Code>
									</Group>
								</List.Item>
							))
						)}
					</List>
				)}
			</Paper>

			<Paper p="md" radius="md" style={panelStyle}>
				<Group justify="space-between" align="flex-start" wrap="wrap" mb="md">
					<div>
						<Text fw={600} mb={4}>
							Sync
						</Text>
						<Text size="sm" c="dimmed">
							Checks upcoming events, creates reminders, and detects completed TickTick tasks
						</Text>
					</div>
					<Button
						color="forest"
						leftSection={<IconRefresh size={16} />}
						loading={syncingTimeOff}
						onClick={() => {
							setSyncingTimeOff(true);
							void syncTimeOff()
								.then((result) => {
									notifications.show({
										color: 'teal',
										title: 'Time off sync complete',
										message: `Scanned ${result.scanned} · Created ${result.remindersCreated} · Completed ${result.completionsDetected} · Skipped ${result.skipped}`,
									});
									return loadTimeOffEvents();
								})
								.catch((err) => {
									notifications.show({
										color: 'orange',
										title: 'Time off sync failed',
										message: err instanceof Error ? err.message : 'Unknown error',
									});
								})
								.finally(() => setSyncingTimeOff(false));
						}}
					>
						Run sync
					</Button>
				</Group>

				{loadingTimeOffEvents && !timeOffEvents ? (
					<Group justify="center" py="md">
						<Loader color="forest" size="sm" />
					</Group>
				) : timeOffEvents && timeOffEvents.length === 0 ? (
					<Text c="dimmed" size="sm">
						No tracked events yet — run a sync after connecting calendar and setting{' '}
						<Code>GOOGLE_TIME_OFF_CALENDAR_ID</Code>
					</Text>
				) : (
					<Table.ScrollContainer minWidth={500}>
						<Table striped highlightOnHover>
							<Table.Thead>
								<Table.Tr>
									<Table.Th>Event</Table.Th>
									<Table.Th>Event date</Table.Th>
									<Table.Th>Remind on</Table.Th>
									<Table.Th>Status</Table.Th>
									<Table.Th />
								</Table.Tr>
							</Table.Thead>
							<Table.Tbody>
								{timeOffEvents?.map((event) => (
									<Table.Tr key={event.eventId}>
										<Table.Td>
											<Text size="sm">{event.title}</Text>
										</Table.Td>
										<Table.Td>
											<Text size="sm" c="dimmed">
												{new Date(event.start).toLocaleDateString(undefined, {
													weekday: 'short',
													month: 'short',
													day: 'numeric',
												})}
											</Text>
										</Table.Td>
										<Table.Td>
											<Text size="sm" c="dimmed">
												{formatReminderDueDate(event.reminderDueDate)}
											</Text>
										</Table.Td>
										<Table.Td>
											<Badge
												color={event.status === 'completed' ? 'teal' : 'orange'}
												variant="light"
												size="sm"
											>
												{event.status === 'completed' ? 'Completed' : 'Reminder created'}
											</Badge>
										</Table.Td>
										<Table.Td>
											{event.status === 'reminder_created' && (
												<Button
													size="xs"
													variant="outline"
													color="stone"
													loading={markingEventId === event.eventId}
													onClick={() => {
														setMarkingEventId(event.eventId);
														void markTimeOffCompleted(event.eventId)
															.then(() => loadTimeOffEvents())
															.catch((err) => {
																notifications.show({
																	color: 'orange',
																	message:
																		err instanceof Error
																			? err.message
																			: 'Update failed',
																});
															})
															.finally(() => setMarkingEventId(null));
													}}
												>
													Mark complete
												</Button>
											)}
										</Table.Td>
									</Table.Tr>
								))}
							</Table.Tbody>
						</Table>
					</Table.ScrollContainer>
				)}
			</Paper>
		</Stack>
	);
}
