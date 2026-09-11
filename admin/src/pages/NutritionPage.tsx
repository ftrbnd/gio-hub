import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconApple, IconX } from '@tabler/icons-react';
import { PageHeader } from '../components/dashboard/PageHeader';
import { MfpJobModal } from '../components/nutrition/MfpJobModal';
import { MfpLogo } from '../components/nutrition/MfpLogo';
import { NutritionDraftComposer } from '../components/nutrition/NutritionDraftComposer';
import { NutritionNote } from '../components/nutrition/NutritionNote';
import {
	ApiError,
	calculateNutritionEntry,
	cancelMfpBrowser,
	createNutritionEntry,
	deleteNutritionEntry,
	getMfpSessionStatus,
	listNutritionEntries,
	patchNutritionEntry,
	startMfpLog,
	uploadNutritionPhotos,
	type NutritionEntry,
} from '../lib/api';
import '../components/nutrition/nutritionCalShimmer.css';

const QUERY_KEY = ['nutrition', 'entries'] as const;
const MFP_STATUS_KEY = ['mfp', 'session'] as const;

function upsertEntry(
	entries: NutritionEntry[],
	entry: NutritionEntry,
): NutritionEntry[] {
	const idx = entries.findIndex((e) => e.id === entry.id);
	if (idx === -1) return [entry, ...entries];
	const next = entries.slice();
	next[idx] = entry;
	return next;
}

export function NutritionPage() {
	const queryClient = useQueryClient();
	const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
	const { data, isLoading, isError, error } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: listNutritionEntries,
	});
	const mfpStatusQuery = useQuery({
		queryKey: MFP_STATUS_KEY,
		queryFn: getMfpSessionStatus,
		refetchInterval: (query) =>
			query.state.data?.browserBusy || !query.state.data?.workerOnline
				? 2000
				: 15_000,
	});
	const [jobModalOpen, { open: openJobModal, close: closeJobModal }] =
		useDisclosure(false);
	const [activeMfpJob, setActiveMfpJob] = useState<{
		jobId: string;
		entryId: string;
	} | null>(null);
	const [cancellingBrowser, setCancellingBrowser] = useState(false);

	useEffect(() => {
		const status = mfpStatusQuery.data;
		if (!status?.browserBusy || !status.activeJobId || !status.activeEntryId) {
			return;
		}
		setActiveMfpJob((prev) => {
			if (prev?.jobId === status.activeJobId) return prev;
			return { jobId: status.activeJobId!, entryId: status.activeEntryId! };
		});
	}, [mfpStatusQuery.data]);

	const createMutation = useMutation({
		mutationFn: (query: string) => createNutritionEntry(query),
		onSuccess: ({ entry }) => {
			queryClient.setQueryData(
				QUERY_KEY,
				(prev: { entries: NutritionEntry[] } | undefined) => ({
					entries: upsertEntry(prev?.entries ?? [], entry),
				}),
			);
		},
		onError: (err: unknown) => {
			notifications.show({
				color: 'orange',
				title: 'Could not create note',
				message: err instanceof Error ? err.message : 'Unknown error',
			});
		},
	});

	const createMutateAsyncRef = useRef(createMutation.mutateAsync);
	createMutateAsyncRef.current = createMutation.mutateAsync;

	const setEntry = useCallback(
		(entry: NutritionEntry) => {
			queryClient.setQueryData(
				QUERY_KEY,
				(prev: { entries: NutritionEntry[] } | undefined) => ({
					entries: upsertEntry(prev?.entries ?? [], entry),
				}),
			);
		},
		[queryClient],
	);

	const patchEntry = useCallback(
		async (id: string, patch: { query?: string }) => {
			const { entry } = await patchNutritionEntry(id, patch);
			setEntry(entry);
		},
		[setEntry],
	);

	const calculateEntry = useCallback(
		async (id: string) => {
			queryClient.setQueryData(
				QUERY_KEY,
				(prev: { entries: NutritionEntry[] } | undefined) => {
					if (!prev) return prev;
					return {
						entries: prev.entries.map((e) =>
							e.id === id
								? { ...e, status: 'calculating' as const, errorMessage: null }
								: e,
						),
					};
				},
			);
			try {
				const { entry } = await calculateNutritionEntry(id);
				setEntry(entry);
			} catch (err) {
				notifications.show({
					color: 'orange',
					title: 'Calculation failed',
					message: err instanceof Error ? err.message : 'Unknown error',
				});
				await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
			}
		},
		[queryClient, setEntry],
	);

	const uploadPhotos = useCallback(
		async (id: string, files: File[]) => {
			const { entry } = await uploadNutritionPhotos(id, files);
			setEntry(entry);
		},
		[setEntry],
	);

	const removeEntry = useCallback(
		async (id: string) => {
			await deleteNutritionEntry(id);
			queryClient.setQueryData(
				QUERY_KEY,
				(prev: { entries: NutritionEntry[] } | undefined) => ({
					entries: (prev?.entries ?? []).filter((e) => e.id !== id),
				}),
			);
		},
		[queryClient],
	);

	const calculateMutateAsyncRef = useRef(calculateEntry);
	calculateMutateAsyncRef.current = calculateEntry;

	const uploadPhotosMutateAsyncRef = useRef(uploadPhotos);
	uploadPhotosMutateAsyncRef.current = uploadPhotos;

	const commitDraft = useCallback(async (query: string, photos: File[]) => {
		const { entry } = await createMutateAsyncRef.current(query);
		if (photos.length > 0) {
			await uploadPhotosMutateAsyncRef.current(entry.id, photos);
		}
		await calculateMutateAsyncRef.current(entry.id);
	}, []);

	const logToMfp = useCallback(
		async (entryId: string) => {
			try {
				const { job } = await startMfpLog(entryId);
				setActiveMfpJob({ jobId: job.id, entryId });
				await queryClient.invalidateQueries({ queryKey: MFP_STATUS_KEY });
			} catch (err) {
				if (err instanceof ApiError && err.status === 409) {
					await queryClient.invalidateQueries({ queryKey: MFP_STATUS_KEY });
					return;
				}
				if (err instanceof ApiError && err.status === 503) {
					notifications.show({
						color: 'orange',
						title: 'Mac not available',
						message:
							err.message ||
							'Start the MFP worker on this machine, then try again.',
					});
					await queryClient.invalidateQueries({ queryKey: MFP_STATUS_KEY });
					return;
				}
				notifications.show({
					color: 'orange',
					title: 'Could not start MFP log',
					message: err instanceof Error ? err.message : 'Unknown error',
				});
				throw err;
			}
		},
		[queryClient],
	);

	const clearActiveMfpJob = useCallback(() => {
		setActiveMfpJob(null);
		void queryClient.invalidateQueries({ queryKey: MFP_STATUS_KEY });
	}, [queryClient]);

	const completedMfpJobsRef = useRef(new Set<string>());
	const handleMfpJobFinished = useCallback(
		(outcome: 'done' | 'error', jobId: string | null, detail?: string) => {
			if (jobId) {
				if (completedMfpJobsRef.current.has(jobId)) return;
				completedMfpJobsRef.current.add(jobId);
			}
			if (outcome === 'done') {
				notifications.show({
					color: 'teal',
					title: 'Logged to MyFitnessPal',
					message:
						detail ||
						'Foods were added on your Mac. Chrome stays open so you stay signed in.',
				});
			} else {
				notifications.show({
					color: 'orange',
					title: 'MyFitnessPal log failed',
					message: detail || 'Check the job log or try again.',
				});
			}
			void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
			closeJobModal();
			// Keep job id briefly so the note can show a success banner.
			window.setTimeout(() => {
				clearActiveMfpJob();
			}, outcome === 'done' ? 2500 : 0);
		},
		[clearActiveMfpJob, closeJobModal, queryClient],
	);

	const cancelBrowser = useCallback(async () => {
		setCancellingBrowser(true);
		try {
			await cancelMfpBrowser();
			closeJobModal();
			clearActiveMfpJob();
			notifications.show({
				color: 'forest',
				message: 'MyFitnessPal task cancelled',
			});
		} catch (err) {
			notifications.show({
				color: 'orange',
				title: 'Could not cancel',
				message: err instanceof Error ? err.message : 'Unknown error',
			});
		} finally {
			setCancellingBrowser(false);
			await queryClient.invalidateQueries({ queryKey: MFP_STATUS_KEY });
		}
	}, [clearActiveMfpJob, closeJobModal, queryClient]);

	if (isLoading) {
		return (
			<Group justify="center" py="xl">
				<Loader color="forest" />
			</Group>
		);
	}

	if (isError) {
		return (
			<Text c="orange">
				{error instanceof Error ? error.message : 'Failed to load notes'}
			</Text>
		);
	}

	const entries = data?.entries ?? [];
	const mfpWorkerOnline = mfpStatusQuery.data?.workerOnline ?? false;
	const mfpBrowserBusy = mfpStatusQuery.data?.browserBusy ?? false;
	const mfpActiveJobStatus = mfpStatusQuery.data?.activeJobStatus ?? null;

	const composer = (
		<NutritionDraftComposer
			onCommit={commitDraft}
			disabled={createMutation.isPending}
		/>
	);

	return (
		<Stack
			gap="md"
			style={
				isMobile
					? {
							minHeight: 'calc(100dvh - 64px - 2rem)',
							paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
						}
					: undefined
			}
		>
			{!mfpWorkerOnline ? (
				<Box
					style={{
						borderRadius: 10,
						padding: '10px 12px',
						background: 'rgba(200, 100, 40, 0.12)',
						border: '1px solid rgba(200, 100, 40, 0.4)',
					}}
				>
					<Text size="sm" fw={600} c="orange">
						Mac worker offline
					</Text>
					<Text size="xs" c="dimmed">
						Start Chrome with `pnpm mfp-chrome`, then `pnpm mfp-worker` (or
						`pnpm dev:mfp`).
					</Text>
				</Box>
			) : null}

			{mfpBrowserBusy ? (
				<Box
					style={{
						borderRadius: 10,
						padding: '10px 12px',
						background: 'rgba(0, 102, 238, 0.12)',
						border: '1px solid rgba(0, 102, 238, 0.4)',
					}}
				>
					<Group justify="space-between" align="center" gap="sm" wrap="nowrap">
						<Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
							<MfpLogo size={18} />
							<Stack gap={2} style={{ minWidth: 0 }}>
								<Text size="sm" fw={600} c="mfp">
									{mfpActiveJobStatus === 'needs_input' ? (
										'Needs you on the Mac browser'
									) : mfpActiveJobStatus === 'queued' ? (
										<span className="nutritionCalShimmer">
											Waiting for Mac worker…
										</span>
									) : (
										<span className="nutritionCalShimmer">
											Logging on your Mac…
										</span>
									)}
								</Text>
								<Text size="xs" c="dimmed">
									{mfpActiveJobStatus === 'needs_input'
										? 'Finish anything needed in the Chrome window on your Mac.'
										: 'A log job is running on your Mac. Cancel to stop it.'}
								</Text>
							</Stack>
						</Group>
						<Group gap="xs" wrap="nowrap">
							{activeMfpJob ? (
								<Button
									size="compact-sm"
									variant="light"
									color="mfp"
									onClick={openJobModal}
								>
									View
								</Button>
							) : null}
							<Button
								size="compact-sm"
								variant="filled"
								color="orange"
								leftSection={<IconX size={14} />}
								loading={cancellingBrowser}
								onClick={() => {
									void cancelBrowser();
								}}
							>
								Cancel
							</Button>
						</Group>
					</Group>
				</Box>
			) : null}

			<Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
				<PageHeader icon={<IconApple size={24} />} title="Nutrition" />
				<Group gap="xs">
					<Button
						size="compact-sm"
						variant="light"
						color={mfpWorkerOnline ? 'teal' : 'red'}
						leftSection={
							<Box
								style={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									background: mfpWorkerOnline
										? 'var(--mantine-color-teal-5)'
										: 'var(--mantine-color-red-5)',
								}}
							/>
						}
						style={{ pointerEvents: 'none' }}
					>
						{mfpWorkerOnline ? 'Mac online' : 'Mac offline'}
					</Button>
				</Group>
			</Group>

			{!isMobile ? composer : null}

			<Stack gap="md" style={isMobile ? { flex: 1 } : undefined}>
				{entries.map((entry) => (
					<NutritionNote
						key={entry.id}
						entry={entry}
						mfpConnected={mfpWorkerOnline}
						mfpJobId={
							activeMfpJob?.entryId === entry.id
								? activeMfpJob.jobId
								: null
						}
						onPatch={(patch) => patchEntry(entry.id, patch)}
						onCalculate={() => calculateEntry(entry.id)}
						onUploadPhotos={(files) => uploadPhotos(entry.id, files)}
						onDelete={() => removeEntry(entry.id)}
						onLogToMfp={() => logToMfp(entry.id)}
						onOpenMfpJob={openJobModal}
						onMfpJobDone={(outcome, jobId, detail) => {
							handleMfpJobFinished(outcome, jobId, detail);
						}}
					/>
				))}
			</Stack>

			{isMobile ? (
				<Box
					style={{
						position: 'sticky',
						bottom: 0,
						zIndex: 5,
						marginTop: 'auto',
						paddingTop: 8,
						paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
					}}
				>
					{composer}
				</Box>
			) : null}

			<MfpJobModal
				opened={jobModalOpen}
				jobId={activeMfpJob?.jobId ?? null}
				onClose={closeJobModal}
				onFinished={(outcome, jobId, detail) => {
					handleMfpJobFinished(outcome, jobId, detail);
				}}
			/>
		</Stack>
	);
}
