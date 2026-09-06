import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	listFilmFavorites,
	listFilmFolders,
	listFolderPhotos,
	rotatePhoto,
	toggleFilmFavorite,
	type FilmPhotoItem,
	type FilmPhotosPage,
} from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

async function fetchFilmPhotosPage(
	folder: string,
	page: number,
	cursors: (string | undefined)[],
): Promise<{ result: FilmPhotosPage; cursors: (string | undefined)[] }> {
	const nextCursors = [...cursors];

	while (nextCursors.length < page) {
		const prevCursor = nextCursors[nextCursors.length - 1];
		const bridge = await listFolderPhotos(folder, prevCursor);
		nextCursors.push(bridge.nextCursor ?? undefined);
	}

	const cursor = nextCursors[page - 1];
	const result = await listFolderPhotos(folder, cursor);

	if (nextCursors.length === page) {
		nextCursors.push(result.nextCursor ?? undefined);
	} else {
		nextCursors[page] = result.nextCursor ?? undefined;
	}

	return { result, cursors: nextCursors };
}

export function useFilmFolders() {
	return useQuery({
		queryKey: queryKeys.film.folders(),
		queryFn: listFilmFolders,
	});
}

export function useFilmPhotosPage(folder: string | null, page: number) {
	const cursorsRef = useRef<(string | undefined)[]>([undefined]);
	const prevFolderRef = useRef<string | null>(null);

	useEffect(() => {
		if (folder !== prevFolderRef.current) {
			cursorsRef.current = [undefined];
			prevFolderRef.current = folder;
		}
	}, [folder]);

	return useQuery({
		queryKey: queryKeys.film.photos(folder ?? '', page),
		queryFn: async () => {
			const { result, cursors } = await fetchFilmPhotosPage(
				folder!,
				page,
				cursorsRef.current,
			);
			cursorsRef.current = cursors;
			return result;
		},
		enabled: !!folder,
	});
}

async function fetchAllFolderPhotos(folder: string): Promise<FilmPhotoItem[]> {
	const photos: FilmPhotoItem[] = [];
	let cursor: string | undefined;

	for (;;) {
		const page = await listFolderPhotos(folder, cursor);
		photos.push(...page.photos);
		if (!page.nextCursor) break;
		cursor = page.nextCursor;
	}

	return photos;
}

export function useFilmPhotosAll(folder: string | null) {
	return useQuery({
		queryKey: queryKeys.film.photosAll(folder ?? ''),
		queryFn: () => fetchAllFolderPhotos(folder!),
		enabled: !!folder,
	});
}

export type RotationApplyItem = {
	photo: FilmPhotoItem;
	angle: 90 | -90 | 180;
};

export type RotationApplyInput = {
	items: RotationApplyItem[];
	onProgress?: (completed: number, total: number, publicId: string) => void;
};

export type RotationApplyOutcome = PromiseSettledResult<
	Awaited<ReturnType<typeof rotatePhoto>>
>;

export function useApplyPhotoRotations(folder: string | null, page: number) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ items, onProgress }: RotationApplyInput) => {
			const total = items.length;
			let completed = 0;
			const outcomes: RotationApplyOutcome[] = [];

			await Promise.all(
				items.map(async ({ photo, angle }) => {
					try {
						const value = await rotatePhoto(photo.publicId, photo.assetFolder, angle);
						outcomes.push({ status: 'fulfilled', value });
					} catch (reason) {
						outcomes.push({ status: 'rejected', reason });
					} finally {
						completed += 1;
						onProgress?.(completed, total, photo.publicId);
					}
				}),
			);

			return outcomes;
		},
		onSuccess: (outcomes) => {
			if (!folder) return;

			const updatedById = new Map<string, FilmPhotoItem>();
			for (const outcome of outcomes) {
				if (outcome.status === 'fulfilled') {
					updatedById.set(outcome.value.photo.publicId, outcome.value.photo);
				}
			}

			if (updatedById.size === 0) return;

			queryClient.setQueryData<FilmPhotosPage>(
				queryKeys.film.photos(folder, page),
				(old) => {
					if (!old) return old;
					return {
						...old,
						photos: old.photos.map((p) => updatedById.get(p.publicId) ?? p),
					};
				},
			);
		},
	});
}

export function useFilmFavorites() {
	return useQuery({
		queryKey: queryKeys.film.favorites(),
		queryFn: async () => {
			const result = await listFilmFavorites();
			return new Set(result.publicIds);
		},
	});
}

export function useToggleFilmFavorite() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (publicId: string) => toggleFilmFavorite(publicId),
		onMutate: async (publicId) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.film.favorites() });
			const previous = queryClient.getQueryData<Set<string>>(
				queryKeys.film.favorites(),
			);
			queryClient.setQueryData<Set<string>>(queryKeys.film.favorites(), (old) => {
				const next = new Set(old ?? []);
				if (next.has(publicId)) next.delete(publicId);
				else next.add(publicId);
				return next;
			});
			return { previous };
		},
		onError: (_err, _publicId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.film.favorites(), context.previous);
			}
		},
		onSuccess: (result) => {
			queryClient.setQueryData<Set<string>>(queryKeys.film.favorites(), (old) => {
				const next = new Set(old ?? []);
				if (result.favorite) next.add(result.publicId);
				else next.delete(result.publicId);
				return next;
			});
		},
	});
}
