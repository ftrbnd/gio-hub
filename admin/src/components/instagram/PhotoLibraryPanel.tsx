import { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Button,
	Center,
	Group,
	Loader,
	Pagination,
	Paper,
	Select,
	SimpleGrid,
	Stack,
	Text,
} from '@mantine/core';
import {
	IconLayoutColumns,
	IconLayoutList,
	IconRectangleVertical,
	IconStack2,
	IconStar,
} from '@tabler/icons-react';
import type { ComposerDispatch } from '../../hooks/useInstagramComposer';
import {
	useFilmFavorites,
	useFilmFolders,
	useFilmPhotosAll,
	useToggleFilmFavorite,
} from '../../hooks/useFilmQueries';
import {
	detectPhotoOrientation,
	type PhotoOrientation,
} from '../../lib/instagram/orientation';
import { toPlacedPhoto } from '../../lib/instagram/types';
import type { FilmPhotoItem } from '../../lib/api';
import { PhotoDetailModal } from '../PhotoDetailModal';
import { DraggableLibraryPhoto } from './DraggableLibraryPhoto';
import { panelStyle } from '../../theme';

type OrientationFilter = PhotoOrientation | null;
type LibraryViewMode = 'pages' | 'scroll';

const LIBRARY_PAGE_SIZE = 12;
const ORIENTATION_BATCH_SIZE = 6;

type Props = {
	folder: string | null;
	dispatch: ComposerDispatch;
	usedPublicIds: Set<string>;
	onAddPhoto: (photo: ReturnType<typeof toPlacedPhoto>) => void;
};

export function PhotoLibraryPanel({
	folder,
	dispatch,
	usedPublicIds,
	onAddPhoto,
}: Props) {
	const [page, setPage] = useState(1);
	const [viewMode, setViewMode] = useState<LibraryViewMode>('pages');
	const [orientationFilter, setOrientationFilter] =
		useState<OrientationFilter>(null);
	const [favoritesOnly, setFavoritesOnly] = useState(false);
	const [detailPhoto, setDetailPhoto] = useState<FilmPhotoItem | null>(null);
	const [orientations, setOrientations] = useState<
		Record<string, PhotoOrientation>
	>({});
	const [detecting, setDetecting] = useState(false);

	const { data: foldersData, isLoading: loadingFolders } = useFilmFolders();
	const { data: allPhotos = [], isLoading: loadingPhotos } =
		useFilmPhotosAll(folder);
	const { data: favoriteIds } = useFilmFavorites();
	const toggleFavorite = useToggleFilmFavorite();

	const folders = foldersData?.folders ?? [];

	const folderOptions = folders.map((f) => ({
		value: f.folder,
		label: `${f.folder} (${f.photoCount})`,
	}));

	useEffect(() => {
		if (folder || loadingFolders || folders.length === 0) return;
		const defaultFolder = foldersData?.defaultFolder ?? folders[0]?.folder;
		if (defaultFolder) {
			dispatch({ type: 'SET_FOLDER', folder: defaultFolder });
		}
	}, [folder, loadingFolders, folders, foldersData?.defaultFolder, dispatch]);

	useEffect(() => {
		setPage(1);
		setOrientationFilter(null);
		setFavoritesOnly(false);
		setOrientations({});
	}, [folder]);

	useEffect(() => {
		setPage(1);
	}, [orientationFilter, favoritesOnly]);

	useEffect(() => {
		if (allPhotos.length === 0) {
			setDetecting(false);
			return;
		}

		const missing = allPhotos.filter((photo) => !orientations[photo.publicId]);
		if (missing.length === 0) {
			setDetecting(false);
			return;
		}

		let cancelled = false;
		setDetecting(true);

		void (async () => {
			const updates: Record<string, PhotoOrientation> = {};

			for (let i = 0; i < missing.length; i += ORIENTATION_BATCH_SIZE) {
				if (cancelled) return;
				const batch = missing.slice(i, i + ORIENTATION_BATCH_SIZE);
				await Promise.all(
					batch.map(async (photo) => {
						updates[photo.publicId] = await detectPhotoOrientation(
							photo.secureUrl,
						);
					}),
				);
				if (cancelled) return;
				setOrientations((prev) => ({ ...prev, ...updates }));
			}

			if (!cancelled) setDetecting(false);
		})();

		return () => {
			cancelled = true;
		};
		// Cache grows via setOrientations; only re-scan when the roll contents change.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
	}, [allPhotos]);

	function toggleFilter(next: PhotoOrientation) {
		setOrientationFilter((prev) => (prev === next ? null : next));
	}

	const orientationsReady =
		allPhotos.length === 0 ||
		allPhotos.every((photo) => orientations[photo.publicId] != null);

	const filteredPhotos = useMemo(() => {
		let photos = allPhotos;
		if (favoritesOnly) {
			photos = photos.filter((photo) => favoriteIds?.has(photo.publicId));
		}
		if (orientationFilter) {
			photos = photos.filter(
				(photo) => orientations[photo.publicId] === orientationFilter,
			);
		}
		return photos;
	}, [allPhotos, favoritesOnly, favoriteIds, orientationFilter, orientations]);

	const favoriteCountInRoll = useMemo(() => {
		if (!favoriteIds) return 0;
		return allPhotos.filter((photo) => favoriteIds.has(photo.publicId)).length;
	}, [allPhotos, favoriteIds]);

	const totalPages = Math.max(
		1,
		Math.ceil(filteredPhotos.length / LIBRARY_PAGE_SIZE),
	);
	const safePage = Math.min(page, totalPages);
	const visiblePhotos =
		viewMode === 'scroll'
			? filteredPhotos
			: filteredPhotos.slice(
					(safePage - 1) * LIBRARY_PAGE_SIZE,
					safePage * LIBRARY_PAGE_SIZE,
				);

	const waitingOnFilter = orientationFilter !== null && !orientationsReady;

	if (loadingFolders) {
		return (
			<Center py="xl">
				<Loader color="forest" />
			</Center>
		);
	}

	const photoGrid = (
		<SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
			{visiblePhotos.map((photo) => {
				const placed = toPlacedPhoto(photo);
				const inUse = usedPublicIds.has(photo.publicId);
				return (
					<DraggableLibraryPhoto
						key={photo.publicId}
						photo={placed}
						disabled={inUse}
						favorite={favoriteIds?.has(photo.publicId) ?? false}
						onClick={() => onAddPhoto(placed)}
						onToggleFavorite={() => toggleFavorite.mutate(photo.publicId)}
						onOpenDetail={() => setDetailPhoto(photo)}
					/>
				);
			})}
		</SimpleGrid>
	);

	return (
		<>
		<Paper
			p="md"
			radius="md"
			style={{
				...panelStyle,
				flex: 1,
				width: '100%',
				minHeight: 0,
				maxHeight: '100%',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
			}}
		>
			<Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
				<Group justify="space-between" align="center">
					<Text size="sm" fw={600}>
						Photo library
					</Text>
					{!loadingPhotos && allPhotos.length > 0 && (
						<Text size="xs" c="dimmed">
							{favoritesOnly || orientationFilter
								? `${filteredPhotos.length} shown`
								: `${allPhotos.length} photos`}
							{favoriteCountInRoll > 0 ? ` · ${favoriteCountInRoll} favorited` : ''}
						</Text>
					)}
				</Group>

				<Select
					placeholder="Select roll"
					data={folderOptions}
					value={folder}
					onChange={(value) => dispatch({ type: 'SET_FOLDER', folder: value })}
					searchable
					clearable={false}
				/>

				<Group gap="xs" justify="space-between" wrap="wrap">
					<Group gap="xs">
						<Button
							size="xs"
							variant={favoritesOnly ? 'filled' : 'light'}
							color="forest"
							leftSection={<IconStar size={14} />}
							onClick={() => setFavoritesOnly((prev) => !prev)}
							disabled={loadingPhotos}
						>
							Favorites
						</Button>
						<Button
							size="xs"
							variant={orientationFilter === 'vertical' ? 'filled' : 'light'}
							color="forest"
							leftSection={<IconRectangleVertical size={14} />}
							onClick={() => toggleFilter('vertical')}
							disabled={loadingPhotos || (detecting && !orientationsReady)}
						>
							Vertical
						</Button>
						<Button
							size="xs"
							variant={orientationFilter === 'horizontal' ? 'filled' : 'light'}
							color="forest"
							leftSection={<IconLayoutColumns size={14} />}
							onClick={() => toggleFilter('horizontal')}
							disabled={loadingPhotos || (detecting && !orientationsReady)}
						>
							Horizontal
						</Button>
						{detecting && (
							<Text size="xs" c="dimmed">
								Detecting…
							</Text>
						)}
					</Group>
					<Group gap="xs">
						<Button
							size="xs"
							variant={viewMode === 'pages' ? 'filled' : 'light'}
							color="forest"
							leftSection={<IconLayoutList size={14} />}
							onClick={() => setViewMode('pages')}
						>
							Pages
						</Button>
						<Button
							size="xs"
							variant={viewMode === 'scroll' ? 'filled' : 'light'}
							color="forest"
							leftSection={<IconStack2 size={14} />}
							onClick={() => setViewMode('scroll')}
						>
							Scroll
						</Button>
					</Group>
				</Group>

				{loadingPhotos || waitingOnFilter ? (
					<Center py="xl" style={{ flex: 1 }}>
						<Loader color="forest" size="sm" />
					</Center>
				) : allPhotos.length === 0 ? (
					<Text size="sm" c="dimmed">
						No photos in this roll.
					</Text>
				) : filteredPhotos.length === 0 ? (
					<Text size="sm" c="dimmed">
						{favoritesOnly
							? 'No favorites in this roll.'
							: `No ${orientationFilter} photos in this roll.`}
					</Text>
				) : (
					<Box
						style={{
							flex: 1,
							minHeight: 0,
							overflowY: 'auto',
							paddingRight: 4,
						}}
					>
						{photoGrid}
					</Box>
				)}

				{viewMode === 'pages' && totalPages > 1 && (
					<Center w="100%">
						<Pagination
							value={safePage}
							onChange={setPage}
							total={totalPages}
							size="sm"
							color="forest"
							styles={{
								root: {
									width: '100%',
									justifyContent: 'center',
								},
							}}
						/>
					</Center>
				)}
			</Stack>
		</Paper>

		<PhotoDetailModal
			opened={detailPhoto !== null}
			photo={detailPhoto}
			favorite={
				detailPhoto ? (favoriteIds?.has(detailPhoto.publicId) ?? false) : false
			}
			onClose={() => setDetailPhoto(null)}
			onToggleFavorite={
				detailPhoto
					? () => toggleFavorite.mutate(detailPhoto.publicId)
					: undefined
			}
		/>
		</>
	);
}
