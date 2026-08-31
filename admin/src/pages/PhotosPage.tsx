import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
	Button,
	Checkbox,
	Group,
	Paper,
	Stack,
	Text,
	Title,
	Image,
	Loader,
	NumberInput,
	Progress,
	Select,
	SimpleGrid,
	Pagination,
	Center,
	Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
	IconRotate,
	IconRotateClockwise,
	IconArrowBarToUp,
	IconCheck,
	IconExternalLink,
} from '@tabler/icons-react';
import type { FilmPhotoItem } from '../lib/api';
import { portfolioFilmUrl } from '../lib/portfolio';
import {
	useApplyPhotoRotations,
	useFilmFolders,
	useFilmPhotosPage,
} from '../hooks/useFilmQueries';
import { colors, panelStyle, panelStyleAccent } from '../theme';

function cacheBust(url: string, token: number) {
	const sep = url.includes('?') ? '&' : '?';
	return `${url}${sep}t=${token}`;
}

function parsePageParam(value: string | null): number {
	const parsed = Number.parseInt(value ?? '1', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeDegrees(degrees: number): number {
	return ((degrees % 360) + 360) % 360;
}

function addRotation(current: number, angle: 90 | -90 | 180): number {
	return normalizeDegrees(current + angle);
}

function toApiAngle(degrees: number): 90 | -90 | 180 | null {
	const normalized = normalizeDegrees(degrees);
	if (normalized === 0) return null;
	if (normalized === 90) return 90;
	if (normalized === 180) return 180;
	if (normalized === 270) return -90;
	return null;
}

export function PhotosPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialFolder = searchParams.get('folder');
	const initialPage = parsePageParam(searchParams.get('page'));

	const [selectedFolder, setSelectedFolder] = useState<string | null>(
		initialFolder,
	);
	const [page, setPage] = useState(initialPage);
	const [folderInitialized, setFolderInitialized] = useState(false);
	const [bulkProcessingIds, setBulkProcessingIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [applyProgress, setApplyProgress] = useState<{
		completed: number;
		total: number;
	} | null>(null);
	const [pendingRotations, setPendingRotations] = useState<Map<string, number>>(
		() => new Map(),
	);
	const [selectedPhotos, setSelectedPhotos] = useState<
		Map<string, FilmPhotoItem>
	>(() => new Map());
	const [urlTokens, setUrlTokens] = useState<Record<string, number>>({});

	const {
		data: foldersData,
		isLoading: loadingFolders,
		isError: foldersError,
	} = useFilmFolders();
	const {
		data: photosPage,
		isLoading: loadingPhotos,
		isError: photosError,
	} = useFilmPhotosPage(selectedFolder, page);
	const applyRotations = useApplyPhotoRotations(selectedFolder, page);

	const folders = foldersData?.folders ?? [];
	const photos = photosPage?.photos ?? [];
	const totalPages = photosPage?.totalPages ?? 1;
	const totalPhotos = photosPage?.total ?? 0;
	const isApplying = applyRotations.isPending;

	const prevFolderRef = useRef<string | null>(null);

	const folderOptions = folders.map((f) => ({
		value: f.folder,
		label: `${f.folder} (${f.photoCount})`,
	}));

	const syncUrl = useCallback(
		(folder: string, pageNum: number) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.set('folder', folder);
					if (pageNum > 1) {
						next.set('page', String(pageNum));
					} else {
						next.delete('page');
					}
					return next;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);

	useEffect(() => {
		if (!foldersData || folderInitialized) return;

		const folderNames = new Set(foldersData.folders.map((f) => f.folder));
		if (initialFolder && folderNames.has(initialFolder)) {
			setSelectedFolder(initialFolder);
			setPage(initialPage);
		} else if (foldersData.defaultFolder) {
			setSelectedFolder(foldersData.defaultFolder);
			setPage(1);
			syncUrl(foldersData.defaultFolder, 1);
		}

		setFolderInitialized(true);
	}, [foldersData, folderInitialized, initialFolder, initialPage, syncUrl]);

	useEffect(() => {
		if (!photosPage || !selectedFolder) return;
		if (page > photosPage.totalPages && photosPage.totalPages > 0) {
			const clamped = photosPage.totalPages;
			setPage(clamped);
			syncUrl(selectedFolder, clamped);
		}
	}, [photosPage, page, selectedFolder, syncUrl]);

	useEffect(() => {
		if (!selectedFolder) return;
		if (prevFolderRef.current === selectedFolder) return;

		prevFolderRef.current = selectedFolder;
		setSelectedPhotos(new Map());
		setPendingRotations(new Map());
	}, [selectedFolder]);

	useEffect(() => {
		if (foldersError) {
			notifications.show({
				color: 'orange',
				message: 'Failed to load folders',
			});
		}
	}, [foldersError]);

	useEffect(() => {
		if (photosError) {
			notifications.show({
				color: 'orange',
				message: 'Failed to load photos',
			});
		}
	}, [photosError]);

	function previewRotate(photo: FilmPhotoItem, angle: 90 | -90 | 180) {
		setPendingRotations((prevPending) => {
			const current = prevPending.get(photo.publicId) ?? 0;
			const updated = addRotation(current, angle);

			if (updated !== 0) {
				setSelectedPhotos((prevSelected) => {
					const nextSelected = new Map(prevSelected);
					nextSelected.set(photo.publicId, photo);
					return nextSelected;
				});
			}

			const nextPending = new Map(prevPending);
			if (updated === 0) {
				nextPending.delete(photo.publicId);
			} else {
				nextPending.set(photo.publicId, updated);
			}
			return nextPending;
		});
	}

	function previewBulkRotate(angle: 90 | -90 | 180) {
		setPendingRotations((prev) => {
			const next = new Map(prev);
			for (const photo of selectedPhotos.values()) {
				const current = next.get(photo.publicId) ?? 0;
				const updated = addRotation(current, angle);
				if (updated === 0) {
					next.delete(photo.publicId);
				} else {
					next.set(photo.publicId, updated);
				}
			}
			return next;
		});
	}

	function resetSelectedPreviews() {
		setPendingRotations((prev) => {
			const next = new Map(prev);
			for (const photo of selectedPhotos.values()) {
				next.delete(photo.publicId);
			}
			return next;
		});
	}

	function togglePhotoSelection(photo: FilmPhotoItem) {
		setSelectedPhotos((prev) => {
			const next = new Map(prev);
			if (next.has(photo.publicId)) {
				next.delete(photo.publicId);
			} else {
				next.set(photo.publicId, photo);
			}
			return next;
		});
	}

	function toggleSelectAllOnPage() {
		const allOnPageSelected =
			photos.length > 0 && photos.every((p) => selectedPhotos.has(p.publicId));

		setSelectedPhotos((prev) => {
			const next = new Map(prev);
			for (const photo of photos) {
				if (allOnPageSelected) {
					next.delete(photo.publicId);
				} else {
					next.set(photo.publicId, photo);
				}
			}
			return next;
		});
	}

	function clearSelection() {
		setSelectedPhotos(new Map());
	}

	async function handleConfirm() {
		const targets = [...selectedPhotos.values()].filter((photo) => {
			const degrees = pendingRotations.get(photo.publicId) ?? 0;
			return toApiAngle(degrees) !== null;
		});
		if (targets.length === 0) return;

		setBulkProcessingIds(new Set(targets.map((photo) => photo.publicId)));
		setApplyProgress({ completed: 0, total: targets.length });

		const items = targets.map((photo) => ({
			photo,
			angle: toApiAngle(pendingRotations.get(photo.publicId) ?? 0)!,
		}));

		try {
			const outcomes = await applyRotations.mutateAsync({
				items,
				onProgress: (completed, total, publicId) => {
					setApplyProgress({ completed, total });
					setBulkProcessingIds((prev) => {
						const next = new Set(prev);
						next.delete(publicId);
						return next;
					});
				},
			});

			const updatedById = new Map<string, FilmPhotoItem>();
			let failed = 0;

			for (let i = 0; i < outcomes.length; i++) {
				const result = outcomes[i];
				if (result.status === 'fulfilled') {
					updatedById.set(result.value.photo.publicId, result.value.photo);
				} else {
					failed += 1;
				}
			}

			if (updatedById.size > 0) {
				setSelectedPhotos((prev) => {
					const next = new Map(prev);
					for (const [id] of updatedById) {
						next.delete(id);
					}
					return next;
				});
				setUrlTokens((prev) => {
					const next = { ...prev };
					for (const [id] of updatedById) {
						next[id] = (prev[id] ?? 0) + 1;
					}
					return next;
				});
				setPendingRotations((prev) => {
					const next = new Map(prev);
					for (const [id] of updatedById) {
						next.delete(id);
					}
					return next;
				});
			}

			const succeeded = updatedById.size;
			if (failed === 0) {
				notifications.show({
					color: 'teal',
					message: `Applied rotation to ${succeeded} photo${succeeded === 1 ? '' : 's'}`,
				});
			} else if (succeeded === 0) {
				notifications.show({
					color: 'orange',
					message: 'Failed to apply rotations',
				});
			} else {
				notifications.show({
					color: 'orange',
					message: `Applied ${succeeded}, ${failed} failed`,
				});
			}
		} catch (err) {
			notifications.show({
				color: 'orange',
				message:
					err instanceof Error ? err.message : 'Failed to apply rotations',
			});
		} finally {
			setBulkProcessingIds(new Set());
			setApplyProgress(null);
		}
	}

	const selectedCount = selectedPhotos.size;
	const pendingSelectedCount = [...selectedPhotos.keys()].filter((id) => {
		const degrees = pendingRotations.get(id) ?? 0;
		return toApiAngle(degrees) !== null;
	}).length;
	const allOnPageSelected =
		photos.length > 0 && photos.every((p) => selectedPhotos.has(p.publicId));
	const someOnPageSelected = photos.some((p) => selectedPhotos.has(p.publicId));
	const isBusy = isApplying;

	if (loadingFolders) {
		return (
			<Center py='xl'>
				<Loader color='forest' />
			</Center>
		);
	}

	return (
		<Stack gap='xl'>
			<div>
				<Title
					order={2}
					c='brown.0'>
					Film photos
				</Title>
				<Text
					c='dimmed'
					size='sm'
					mt={4}>
					Preview rotations on each frame, select the ones you want, then
					confirm to save to Cloudinary
				</Text>
			</div>

			<Paper
				p='md'
				radius='md'
				style={panelStyleAccent}>
				<Stack gap='sm'>
					<Text
						size='xs'
						c='dimmed'
						tt='uppercase'
						fw={600}
						lts={0.6}>
						Current roll
					</Text>
					<Select
						placeholder='Select a folder'
						data={folderOptions}
						value={selectedFolder}
						onChange={(value) => {
							if (!value) return;
							setSelectedFolder(value);
							setPage(1);
							syncUrl(value, 1);
						}}
						searchable
						nothingFoundMessage='No folders found'
						styles={{
							input: {
								background: colors.bgDeep,
								borderColor: colors.panelBorder,
								color: colors.text,
							},
						}}
					/>
					{selectedFolder && (
						<Stack gap={4}>
							<Title
								order={2}
								c='brown.0'
								lineClamp={2}>
								{selectedFolder}
							</Title>
							<Anchor
								href={portfolioFilmUrl(selectedFolder)}
								target='_blank'
								rel='noopener noreferrer'
								c='denim.3'
								size='sm'
								fw={500}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 4,
									width: 'fit-content',
								}}>
								View on giosalad.dev
								<IconExternalLink
									size={14}
									stroke={1.75}
								/>
							</Anchor>
							<Text
								size='sm'
								c='dimmed'
								mt={4}>
								{loadingPhotos
									? 'Loading photos…'
									: `${totalPhotos} photo${totalPhotos === 1 ? '' : 's'}${
											totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''
										}`}
							</Text>
						</Stack>
					)}
				</Stack>
			</Paper>

			{selectedFolder && (
				<Stack gap='md'>
					{loadingPhotos ? (
						<Center py='xl'>
							<Loader color='forest' />
						</Center>
					) : photos.length === 0 ? (
						<Text
							c='dimmed'
							size='sm'>
							No photos in this folder
						</Text>
					) : (
						<Stack gap='md'>
							<GallerySelectionToolbar
								allOnPageSelected={allOnPageSelected}
								someOnPageSelected={someOnPageSelected}
								selectedCount={selectedCount}
								pendingSelectedCount={pendingSelectedCount}
								applyProgress={applyProgress}
								isBusy={isBusy}
								isApplying={isApplying}
								onToggleSelectAll={toggleSelectAllOnPage}
								onClearSelection={clearSelection}
								onResetPreviews={resetSelectedPreviews}
								onPreviewBulkRotate={previewBulkRotate}
								onConfirm={() => void handleConfirm()}
							/>

							<SimpleGrid
								cols={{ base: 1, sm: 2, lg: 3 }}
								spacing='md'>
								{photos.map((photo) => (
									<PhotoCard
										key={photo.publicId}
										photo={photo}
										urlToken={urlTokens[photo.publicId] ?? 0}
										selected={selectedPhotos.has(photo.publicId)}
										previewDegrees={pendingRotations.get(photo.publicId) ?? 0}
										onToggleSelect={() => togglePhotoSelection(photo)}
										isApplying={bulkProcessingIds.has(photo.publicId)}
										actionsDisabled={isBusy}
										onPreviewRotate={(angle) => previewRotate(photo, angle)}
									/>
								))}
							</SimpleGrid>

							<GallerySelectionToolbar
								allOnPageSelected={allOnPageSelected}
								someOnPageSelected={someOnPageSelected}
								selectedCount={selectedCount}
								pendingSelectedCount={pendingSelectedCount}
								applyProgress={applyProgress}
								isBusy={isBusy}
								isApplying={isApplying}
								onToggleSelectAll={toggleSelectAllOnPage}
								onClearSelection={clearSelection}
								onResetPreviews={resetSelectedPreviews}
								onPreviewBulkRotate={previewBulkRotate}
								onConfirm={() => void handleConfirm()}
							/>
						</Stack>
					)}

					{totalPages > 1 && (
						<PageNavigator
							page={page}
							totalPages={totalPages}
							disabled={loadingPhotos}
							onPageChange={(nextPage) => {
								setPage(nextPage);
								if (selectedFolder) syncUrl(selectedFolder, nextPage);
							}}
						/>
					)}
				</Stack>
			)}
		</Stack>
	);
}

function PageNavigator({
	page,
	totalPages,
	disabled,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	disabled?: boolean;
	onPageChange: (page: number) => void;
}) {
	const [pageInput, setPageInput] = useState(String(page));

	useEffect(() => {
		setPageInput(String(page));
	}, [page]);

	function commitPageInput() {
		const parsed = Number.parseInt(pageInput, 10);
		if (!Number.isFinite(parsed)) {
			setPageInput(String(page));
			return;
		}

		const clamped = Math.min(Math.max(1, parsed), totalPages);
		setPageInput(String(clamped));
		if (clamped !== page) onPageChange(clamped);
	}

	return (
		<Stack
			gap='sm'
			align='center'
			w='100%'>
			<Pagination
				value={page}
				onChange={onPageChange}
				total={totalPages}
				color='forest'
				disabled={disabled}
				styles={{ root: { justifyContent: 'center' } }}
			/>
			<Stack
				gap={4}
				align='center'>
				<Text
					size='sm'
					c='dimmed'>
					Go to page
				</Text>
				<NumberInput
					value={pageInput}
					onChange={(value) => setPageInput(String(value ?? ''))}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commitPageInput();
					}}
					onBlur={commitPageInput}
					min={1}
					max={totalPages}
					w={72}
					size='sm'
					hideControls
					disabled={disabled}
					styles={{
						input: {
							background: colors.bgDeep,
							borderColor: colors.panelBorder,
							color: colors.text,
							textAlign: 'center',
						},
					}}
				/>
				<Text
					size='sm'
					c='dimmed'>
					of {totalPages}
				</Text>
			</Stack>
		</Stack>
	);
}

function GallerySelectionToolbar({
	allOnPageSelected,
	someOnPageSelected,
	selectedCount,
	pendingSelectedCount,
	applyProgress,
	isBusy,
	isApplying,
	onToggleSelectAll,
	onClearSelection,
	onResetPreviews,
	onPreviewBulkRotate,
	onConfirm,
}: {
	allOnPageSelected: boolean;
	someOnPageSelected: boolean;
	selectedCount: number;
	pendingSelectedCount: number;
	applyProgress: { completed: number; total: number } | null;
	isBusy: boolean;
	isApplying: boolean;
	onToggleSelectAll: () => void;
	onClearSelection: () => void;
	onResetPreviews: () => void;
	onPreviewBulkRotate: (angle: 90 | -90 | 180) => void;
	onConfirm: () => void;
}) {
	return (
		<Paper
			p='sm'
			radius='md'
			style={panelStyle}>
			<Stack gap='sm'>
				<Group
					justify='space-between'
					align='center'
					wrap='wrap'
					gap='sm'>
					<Group gap='md'>
						<Checkbox
							checked={allOnPageSelected}
							indeterminate={someOnPageSelected && !allOnPageSelected}
							onChange={onToggleSelectAll}
							disabled={isBusy}
							label='Select all on page'
							color='forest'
						/>
						{selectedCount > 0 && (
							<Text
								size='sm'
								c='dimmed'>
								{selectedCount} selected
								{pendingSelectedCount > 0
									? ` · ${pendingSelectedCount} with preview`
									: ''}
							</Text>
						)}
					</Group>
					{selectedCount > 0 && (
						<Group gap='xs'>
							<Button
								size='xs'
								variant='subtle'
								color='stone'
								onClick={onClearSelection}
								disabled={isBusy}>
								Clear
							</Button>
							{pendingSelectedCount > 0 && (
								<Button
									size='xs'
									variant='subtle'
									color='stone'
									onClick={onResetPreviews}
									disabled={isBusy}>
									Reset previews
								</Button>
							)}
							<Button
								size='xs'
								color='forest'
								variant='light'
								leftSection={<IconRotate size={14} />}
								disabled={isBusy}
								onClick={() => onPreviewBulkRotate(-90)}>
								↺ 90°
							</Button>
							<Button
								size='xs'
								color='forest'
								variant='light'
								leftSection={<IconArrowBarToUp size={14} />}
								disabled={isBusy}
								onClick={() => onPreviewBulkRotate(180)}>
								180°
							</Button>
							<Button
								size='xs'
								color='forest'
								variant='light'
								leftSection={<IconRotateClockwise size={14} />}
								disabled={isBusy}
								onClick={() => onPreviewBulkRotate(90)}>
								↻ 90°
							</Button>
							<Button
								size='xs'
								color='denim'
								leftSection={
									isApplying ? (
										<Loader
											size={14}
											color='white'
											type='oval'
										/>
									) : (
										<IconCheck size={14} />
									)
								}
								disabled={isBusy || pendingSelectedCount === 0}
								onClick={onConfirm}>
								Apply {pendingSelectedCount > 0 ? pendingSelectedCount : ''}
							</Button>
						</Group>
					)}
				</Group>
				{applyProgress && (
					<Stack gap={4}>
						<Progress
							value={(applyProgress.completed / applyProgress.total) * 100}
							color='forest'
							size='sm'
							animated
						/>
						<Text
							size='xs'
							c='dimmed'>
							Applying {applyProgress.completed} of {applyProgress.total}
						</Text>
					</Stack>
				)}
			</Stack>
		</Paper>
	);
}

function PhotoCard({
	photo,
	urlToken,
	selected,
	previewDegrees,
	onToggleSelect,
	isApplying,
	actionsDisabled,
	onPreviewRotate,
}: {
	photo: FilmPhotoItem;
	urlToken: number;
	selected: boolean;
	previewDegrees: number;
	onToggleSelect: () => void;
	isApplying: boolean;
	actionsDisabled: boolean;
	onPreviewRotate: (angle: 90 | -90 | 180) => void;
}) {
	const hasPreview = previewDegrees !== 0;
	const isHighlighted = selected;

	return (
		<Paper
			p='sm'
			radius='md'
			style={{
				...panelStyle,
				background: isHighlighted ? colors.panelSelected : colors.panel,
				border: isHighlighted
					? `1px solid ${colors.denimBorder}`
					: hasPreview
						? `1px solid ${colors.denimBorder}`
						: panelStyle.border,
				boxShadow: isHighlighted ? `0 0 0 1px ${colors.denimGlow}` : undefined,
				opacity: isApplying ? 0.55 : 1,
				transition:
					'opacity 150ms ease, background 150ms ease, border-color 150ms ease',
			}}>
			<Stack gap='sm'>
				<Group
					justify='space-between'
					align='center'
					wrap='nowrap'
					gap='xs'>
					<Checkbox
						checked={selected}
						onChange={() => onToggleSelect()}
						disabled={actionsDisabled || isApplying}
						color='forest'
						aria-label={`Select ${photo.displayName}`}
					/>
					<Text
						size='sm'
						fw={600}
						lineClamp={1}
						title={photo.displayName}
						style={{ flex: 1 }}>
						{photo.displayName}
					</Text>
					{hasPreview && (
						<Text
							size='xs'
							c='denim.3'
							fw={600}
							style={{ flexShrink: 0 }}>
							{previewDegrees}°
						</Text>
					)}
				</Group>
				<Paper
					radius='sm'
					style={{
						position: 'relative',
						background: isHighlighted
							? colors.imageWellSelected
							: colors.bgDeep,
						border: `1px solid ${colors.denimBorder}`,
						overflow: 'hidden',
						display: 'grid',
						placeItems: 'center',
						minHeight: 200,
						transition: 'background 150ms ease',
					}}>
					<Image
						src={cacheBust(photo.secureUrl, urlToken)}
						alt={photo.displayName}
						mah={280}
						fit='contain'
						style={{
							transform: `rotate(${previewDegrees}deg)`,
							transition: 'transform 150ms ease',
							opacity: isApplying ? 0.45 : 1,
						}}
					/>
					{isApplying && (
						<Center
							style={{
								position: 'absolute',
								inset: 0,
								background: 'rgba(18, 16, 12, 0.35)',
							}}>
							<Loader
								color='forest'
								type='oval'
							/>
						</Center>
					)}
				</Paper>
				<Group
					gap='xs'
					grow>
					<Button
						size='xs'
						color='forest'
						variant={hasPreview ? 'light' : 'filled'}
						leftSection={<IconRotate size={14} />}
						disabled={actionsDisabled || isApplying}
						onClick={() => onPreviewRotate(-90)}>
						↺ 90°
					</Button>
					<Button
						size='xs'
						color='forest'
						variant={hasPreview ? 'light' : 'filled'}
						leftSection={<IconArrowBarToUp size={14} />}
						disabled={actionsDisabled || isApplying}
						onClick={() => onPreviewRotate(180)}>
						180°
					</Button>
					<Button
						size='xs'
						color='forest'
						variant={hasPreview ? 'light' : 'filled'}
						leftSection={<IconRotateClockwise size={14} />}
						disabled={actionsDisabled || isApplying}
						onClick={() => onPreviewRotate(90)}>
						↻ 90°
					</Button>
				</Group>
			</Stack>
		</Paper>
	);
}
