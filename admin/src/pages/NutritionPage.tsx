import { useCallback, useRef } from 'react';
import { Box, Group, Loader, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconApple } from '@tabler/icons-react';
import { PageHeader } from '../components/dashboard/PageHeader';
import { NutritionDraftComposer } from '../components/nutrition/NutritionDraftComposer';
import { NutritionNote } from '../components/nutrition/NutritionNote';
import {
	calculateNutritionEntry,
	createNutritionEntry,
	deleteNutritionEntry,
	listNutritionEntries,
	patchNutritionEntry,
	uploadNutritionPhotos,
	type NutritionEntry,
} from '../lib/api';

const QUERY_KEY = ['nutrition', 'entries'] as const;

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
			<PageHeader icon={<IconApple size={24} />} title="Nutrition" />

			{!isMobile ? composer : null}

			<Stack gap="md" style={isMobile ? { flex: 1 } : undefined}>
				{entries.map((entry) => (
					<NutritionNote
						key={entry.id}
						entry={entry}
						onPatch={(patch) => patchEntry(entry.id, patch)}
						onCalculate={() => calculateEntry(entry.id)}
						onUploadPhotos={(files) => uploadPhotos(entry.id, files)}
						onDelete={() => removeEntry(entry.id)}
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
		</Stack>
	);
}
