import { useEffect } from 'react';
import { Box, Button, Modal, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getMfpJob, mfpJobQueryKey, type MfpJob } from '../../lib/api';
import { colors, panelStyle } from '../../theme';
import './nutritionCalShimmer.css';

type Props = {
	opened: boolean;
	jobId: string | null;
	onClose: () => void;
	onFinished: (
		outcome: 'done' | 'error',
		jobId: string | null,
		detail?: string,
	) => void;
};

function statusLabel(job: MfpJob | null | undefined): string {
	if (!job) return 'Starting…';
	if (job.status === 'queued') return 'Waiting for Mac worker…';
	if (job.status === 'running') return 'Logging on your Mac…';
	if (job.status === 'needs_input') return 'Needs you on the Mac browser';
	if (job.status === 'done') return 'Logged successfully';
	if (job.status === 'error') return 'Failed';
	return 'Starting…';
}

export function MfpJobModal({ opened, jobId, onClose, onFinished }: Props) {
	const jobQuery = useQuery({
		queryKey: mfpJobQueryKey(jobId ?? ''),
		queryFn: () => getMfpJob(jobId!),
		enabled: Boolean(opened && jobId),
		refetchInterval: (query) => {
			const status = query.state.data?.job.status;
			return status === 'queued' ||
				status === 'running' ||
				status === 'needs_input'
				? 1500
				: false;
		},
	});

	const job = jobQuery.data?.job ?? null;

	useEffect(() => {
		if (job?.status === 'done') {
			onFinished('done', job.id);
		} else if (job?.status === 'error') {
			onFinished('error', job.id, job.errorMessage ?? undefined);
		}
	}, [job?.status, job?.id, job?.errorMessage, onFinished]);

	const label = statusLabel(job);
	const busy =
		job?.status === 'queued' ||
		job?.status === 'running' ||
		job?.status === 'needs_input';
	const succeeded = job?.status === 'done';

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			centered
			size="lg"
			title="MyFitnessPal"
			styles={{
				content: { ...panelStyle, background: colors.panel },
				header: {
					background: colors.panel,
					borderBottom: `1px solid ${colors.panelBorder}`,
				},
				body: { background: colors.panel, paddingTop: 16 },
			}}
		>
			<Stack gap="sm">
				<Text fw={600} c={succeeded ? 'teal' : undefined}>
					{busy || !job ? (
						<span className="nutritionCalShimmer">{label}</span>
					) : (
						label
					)}
				</Text>
				{job?.errorMessage ? (
					<Text size="sm" c={job.status === 'error' ? 'orange' : 'dimmed'}>
						{job.errorMessage}
					</Text>
				) : null}
				{job?.status === 'needs_input' ? (
					<Text size="sm" c="dimmed">
						Finish anything needed in the Chrome window on your Mac (cookie
						banner, captcha, 2FA). The worker will continue once you are signed
						in.
					</Text>
				) : null}
				{job?.logs?.length ? (
					<Box
						style={{
							maxHeight: 160,
							overflowY: 'auto',
							fontFamily: 'ui-monospace, monospace',
							fontSize: 11,
							color: colors.textMuted,
						}}
					>
						{job.logs.slice(-30).map((line) => (
							<div key={line}>{line}</div>
						))}
					</Box>
				) : null}
				<Button variant="default" onClick={onClose}>
					{busy ? 'Hide' : 'Close'}
				</Button>
			</Stack>
		</Modal>
	);
}
