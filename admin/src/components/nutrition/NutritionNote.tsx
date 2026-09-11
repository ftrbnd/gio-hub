import { useEffect, useRef, useState } from 'react';
import {
	ActionIcon,
	Box,
	Button,
	Collapse,
	FileButton,
	Group,
	Modal,
	Paper,
	Stack,
	Text,
	Textarea,
	UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
	IconArrowsMaximize,
	IconChevronDown,
	IconChevronRight,
	IconDeviceFloppy,
	IconPhoto,
	IconTrash,
	IconX,
} from '@tabler/icons-react';
import type { NutritionEntry } from '../../lib/api';
import { colors, panelStyle } from '../../theme';
import { NutritionDetails, NutritionMealDetails } from './NutritionDetails';
import './nutritionCalShimmer.css';

const MAX_NUTRITION_PHOTOS = 10;

/** Cloudinary on-the-fly resize for UI thumbs (pass through blob/local URLs). */
function nutritionDisplayUrl(url: string, size: number): string {
	if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
		return url;
	}
	return url.replace(
		'/upload/',
		`/upload/c_fill,g_auto,w_${size},h_${size},f_auto,q_auto/`,
	);
}

type PendingPhoto = {
	file: File;
	url: string;
};

type Props = {
	entry: NutritionEntry;
	onPatch: (patch: { query?: string }) => Promise<void>;
	onCalculate: () => Promise<void>;
	onUploadPhotos: (files: File[]) => Promise<void>;
	onDelete: () => Promise<void>;
};

export function NutritionNote({
	entry,
	onPatch,
	onCalculate,
	onUploadPhotos,
	onDelete,
}: Props) {
	const [query, setQuery] = useState(entry.query);
	const [
		confirmDeleteOpen,
		{ open: openConfirmDelete, close: closeConfirmDelete },
	] = useDisclosure(false);
	const [detailsOpen, { open: openDetails, close: closeDetails }] =
		useDisclosure(false);
	const [
		fieldsOpen,
		{ toggle: toggleFields, close: closeFields, open: openFields },
	] = useDisclosure(
		!(entry.title || entry.result || (entry.items?.length ?? 0) > 0),
	);
	const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const pendingPhotosRef = useRef(pendingPhotos);
	pendingPhotosRef.current = pendingPhotos;
	const queryInputRef = useRef<HTMLTextAreaElement>(null);
	const wasFieldsOpenRef = useRef(fieldsOpen);

	const savedPhotos = entry.photos?.length
		? entry.photos
		: entry.photoUrl
			? [
					{
						url: entry.photoUrl,
						publicId: entry.photoPublicId ?? entry.photoUrl,
					},
				]
			: [];
	const photoCount = savedPhotos.length + pendingPhotos.length;
	const canAddPhotos = photoCount < MAX_NUTRITION_PHOTOS;
	const thumbnailUrl = savedPhotos[0]?.url ?? pendingPhotos[0]?.url ?? null;
	const [fieldsMounted, setFieldsMounted] = useState(fieldsOpen);

	useEffect(() => {
		if (fieldsOpen) setFieldsMounted(true);
	}, [fieldsOpen]);

	useEffect(() => {
		const expanding = fieldsOpen && !wasFieldsOpenRef.current;
		wasFieldsOpenRef.current = fieldsOpen;
		if (!expanding) return;
		const id = window.setTimeout(() => {
			const el = queryInputRef.current;
			if (!el) return;
			el.focus();
			const end = el.value.length;
			el.setSelectionRange(end, end);
		}, 50);
		return () => window.clearTimeout(id);
	}, [fieldsOpen]);

	const displayTitle =
		entry.title?.trim() ||
		entry.result?.title?.trim() ||
		entry.items?.[0]?.result?.title?.trim() ||
		entry.items?.[0]?.name?.trim() ||
		entry.query.trim() ||
		'Untitled';
	const displaySubtitle = entry.restaurant?.trim() || null;
	const hasResolvedResult =
		!!entry.title?.trim() ||
		!!entry.result ||
		(entry.items?.some((item) => item.result) ?? false);
	const hasTitle =
		(entry.status === 'ready' || entry.status === 'calculating') &&
		hasResolvedResult;

	const hasPendingChanges =
		query.trim() !== entry.query.trim() || pendingPhotos.length > 0;

	useEffect(() => {
		return () => {
			for (const photo of pendingPhotosRef.current) {
				URL.revokeObjectURL(photo.url);
			}
		};
	}, []);

	useEffect(() => {
		if (entry.status === 'ready' && hasResolvedResult) {
			closeFields();
		}
	}, [entry.id, entry.status, hasResolvedResult, closeFields]);

	useEffect(() => {
		setQuery(entry.query);
		setPendingPhotos((current) => {
			for (const photo of current) {
				URL.revokeObjectURL(photo.url);
			}
			return [];
		});
		if (!hasResolvedResult) openFields();
	}, [entry.id, hasResolvedResult, openFields]);

	const readyItems = (entry.items ?? []).filter((item) => item.result);
	const totalCalories = (() => {
		if (entry.result?.calories != null) return entry.result.calories;
		if (readyItems.length === 0) return null;
		return readyItems.reduce(
			(sum, item) => sum + (item.result?.calories ?? 0),
			0,
		);
	})();
	const hasReadyNutrition =
		!!entry.result || readyItems.length > 0 || entry.status === 'ready';

	const caloriesLabel =
		totalCalories != null ? `${Math.round(totalCalories)} cal` : '— cal';
	const isRecalculating = saving || entry.status === 'calculating';

	const handleSave = async () => {
		const trimmed = query.trim();
		if (!trimmed || saving || entry.status === 'calculating') return;

		const pending = pendingPhotos;
		setSaving(true);
		try {
			if (trimmed !== entry.query) {
				await onPatch({ query: trimmed });
			}
			if (pending.length > 0) {
				await onUploadPhotos(pending.map((photo) => photo.file));
				setPendingPhotos([]);
				for (const photo of pending) {
					URL.revokeObjectURL(photo.url);
				}
			}
			await onCalculate();
			closeFields();
		} finally {
			setSaving(false);
		}
	};

	const handleAddPhotos = (files: File[] | null) => {
		if (!files?.length || !canAddPhotos) return;
		setPendingPhotos((current) => {
			const remaining = MAX_NUTRITION_PHOTOS - savedPhotos.length - current.length;
			if (remaining <= 0) return current;
			const next = files.slice(0, remaining).map((file) => ({
				file,
				url: URL.createObjectURL(file),
			}));
			return [...current, ...next];
		});
	};

	const removePendingPhoto = (index: number) => {
		setPendingPhotos((current) => {
			const target = current[index];
			if (target) URL.revokeObjectURL(target.url);
			return current.filter((_, i) => i !== index);
		});
	};

	const handleDelete = () => {
		setDeleting(true);
		void onDelete()
			.then(() => {
				closeConfirmDelete();
				closeDetails();
			})
			.finally(() => setDeleting(false));
	};

	const addPhotosButton = (compact = false) =>
		canAddPhotos ? (
			<FileButton
				accept="image/jpeg,image/png,image/gif,image/webp"
				multiple
				onChange={handleAddPhotos}
			>
				{(props) => (
					<Button
						{...props}
						size={compact ? 'compact-sm' : 'sm'}
						variant="outline"
						color="stone"
						leftSection={<IconPhoto size={14} />}
						disabled={saving}
					>
						Add photos
					</Button>
				)}
			</FileButton>
		) : null;

	const contextFields = (
		<Stack gap="sm">
			<Textarea
				ref={queryInputRef}
				label="Query"
				placeholder="e.g. Chicken caesar wrap from Carla Cafe — add ingredients, weight, or notes here too"
				value={query}
				onChange={(e) => setQuery(e.currentTarget.value)}
				autosize
				minRows={2}
				maxRows={8}
				size="sm"
			/>
			{photoCount > 0 ? (
				<Stack gap={6}>
					<Group justify="space-between" align="center">
						<Text size="sm" fw={500}>
							Photos
						</Text>
						{addPhotosButton(true)}
					</Group>
					<Box
						style={{
							display: 'flex',
							gap: 8,
							overflowX: 'auto',
							paddingBottom: 4,
							WebkitOverflowScrolling: 'touch',
						}}
					>
						{savedPhotos.map((photo, index) => (
							<img
								key={photo.publicId}
								src={nutritionDisplayUrl(photo.url, 192)}
								alt={index === 0 ? 'Thumbnail' : `Photo ${index + 1}`}
								loading="lazy"
								decoding="async"
								style={{
									width: 96,
									height: 96,
									borderRadius: 8,
									objectFit: 'cover',
									flexShrink: 0,
									border:
										index === 0
											? `2px solid ${colors.green}`
											: `1px solid ${colors.panelBorder}`,
								}}
							/>
						))}
						{pendingPhotos.map((photo, index) => (
							<Box
								key={photo.url}
								style={{ position: 'relative', flexShrink: 0 }}
							>
								<img
									src={photo.url}
									alt={`Pending photo ${index + 1}`}
									decoding="async"
									style={{
										width: 96,
										height: 96,
										borderRadius: 8,
										objectFit: 'cover',
										display: 'block',
										border:
											savedPhotos.length === 0 && index === 0
												? `2px solid ${colors.green}`
												: `1px dashed ${colors.denimBorder}`,
									}}
								/>
								<ActionIcon
									size="xs"
									radius="xl"
									variant="filled"
									color="dark"
									aria-label="Remove photo"
									disabled={saving}
									onClick={() => removePendingPhoto(index)}
									style={{
										position: 'absolute',
										top: 4,
										right: 4,
									}}
								>
									<IconX size={12} />
								</ActionIcon>
							</Box>
						))}
					</Box>
				</Stack>
			) : (
				addPhotosButton()
			)}
			<Group grow preventGrowOverflow={false}>
				<Button
					variant="outline"
					color="orange"
					leftSection={<IconTrash size={16} />}
					onClick={openConfirmDelete}
				>
					Delete
				</Button>
				<Button
					variant="light"
					color="forest"
					leftSection={
						isRecalculating ? undefined : <IconDeviceFloppy size={16} />
					}
					disabled={
						!query.trim() ||
						isRecalculating ||
						(!hasPendingChanges && hasResolvedResult)
					}
					onClick={() => {
						void handleSave();
					}}
				>
					{isRecalculating ? (
						<span className="nutritionCalShimmer">Saving...</span>
					) : (
						'Save'
					)}
				</Button>
			</Group>
		</Stack>
	);

	return (
		<>
			<Paper
				p='md'
				radius='md'
				style={panelStyle}>
				<Stack gap='sm'>
					<Group
						align='flex-start'
						wrap='nowrap'
						gap='sm'>
						{thumbnailUrl ? (
							<img
								src={nutritionDisplayUrl(thumbnailUrl, 104)}
								alt=""
								decoding="async"
								style={{
									width: 52,
									height: 52,
									borderRadius: 8,
									objectFit: 'cover',
									flexShrink: 0,
									border: `1px solid ${colors.panelBorder}`,
								}}
							/>
						) : null}

						{hasTitle ? (
							<UnstyledButton
								flex={1}
								onClick={toggleFields}
								aria-expanded={fieldsOpen}
								style={{
									textAlign: 'left',
									minWidth: 0,
									paddingTop: 2,
								}}>
								<Group
									gap={6}
									wrap='nowrap'
									align='flex-start'>
									{fieldsOpen ? (
										<IconChevronDown
											size={16}
											color={colors.textMuted}
											style={{ marginTop: 3, flexShrink: 0 }}
										/>
									) : (
										<IconChevronRight
											size={16}
											color={colors.textMuted}
											style={{ marginTop: 3, flexShrink: 0 }}
										/>
									)}
									<Stack
										gap={2}
										style={{ minWidth: 0, flex: 1 }}>
										<Text
											fw={600}
											size="md"
											style={{ color: colors.text }}
										>
											{isRecalculating ? (
												<span className="nutritionCalShimmer">
													{displayTitle}
												</span>
											) : (
												displayTitle
											)}
										</Text>
										{displaySubtitle ? (
											<Text
												size='xs'
												c='dimmed'>
												{displaySubtitle}
											</Text>
										) : null}
									</Stack>
								</Group>
							</UnstyledButton>
						) : (
							<Text
								flex={1}
								fw={600}
								size="md"
								c="dimmed"
								style={{ paddingTop: 2 }}
							>
								{isRecalculating ? (
									<span className="nutritionCalShimmer">New inquiry</span>
								) : (
									'New inquiry'
								)}
							</Text>
						)}

						{entry.status === 'calculating' ? (
							<Button
								size='compact-sm'
								variant='light'
								color='forest'
								disabled
								aria-busy
								aria-label='Calculating nutrition'
								leftSection={<IconArrowsMaximize size={14} />}
								style={{ flexShrink: 0, minWidth: 88 }}>
								<span className='nutritionCalShimmer'>{caloriesLabel}</span>
							</Button>
						) : entry.status === 'ready' && hasReadyNutrition ? (
							<Button
								size='compact-sm'
								variant='light'
								color='forest'
								onClick={openDetails}
								leftSection={<IconArrowsMaximize size={14} />}
								style={{ flexShrink: 0 }}>
								{caloriesLabel}
							</Button>
						) : entry.status === 'error' ? (
							<Button
								size='compact-sm'
								variant='light'
								color='orange'
								onClick={openDetails}
								leftSection={<IconArrowsMaximize size={14} />}
								style={{ flexShrink: 0 }}>
								failed
							</Button>
						) : (
							<Button
								size='compact-sm'
								variant='light'
								color='forest'
								disabled
								leftSection={<IconArrowsMaximize size={14} />}
								style={{ flexShrink: 0 }}>
								— cal
							</Button>
						)}
					</Group>

					{hasTitle ? (
						<Collapse
							expanded={fieldsOpen}
							keepMounted={fieldsMounted}
							transitionDuration={200}
						>
							{contextFields}
						</Collapse>
					) : (
						contextFields
					)}

					{entry.status === 'error' && entry.errorMessage ? (
						<Text
							size='sm'
							c='orange'>
							{entry.errorMessage}
						</Text>
					) : null}
				</Stack>
			</Paper>

			<Modal
				opened={detailsOpen}
				onClose={closeDetails}
				centered
				size='xl'
				radius='md'
				title={
					<Stack gap={2}>
						<Text fw={600}>{displayTitle}</Text>
						{displaySubtitle ? (
							<Text
								size='sm'
								c='dimmed'>
								{displaySubtitle}
							</Text>
						) : null}
					</Stack>
				}
				overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
				styles={{
					content: {
						...panelStyle,
						background: colors.panel,
					},
					header: {
						background: colors.panel,
						borderBottom: `1px solid ${colors.panelBorder}`,
					},
					body: {
						background: colors.panel,
						paddingTop: 20,
					},
				}}>
				<Stack gap="md">
					{entry.result ? (
						<NutritionDetails result={entry.result} />
					) : readyItems.length > 0 ? (
						<NutritionMealDetails
							items={readyItems.flatMap((item) =>
								item.result
									? [
											{
												id: item.id,
												name: item.name,
												result: item.result,
											},
										]
									: [],
							)}
						/>
					) : entry.errorMessage ? (
						<Text size="sm" c="orange">
							{entry.errorMessage}
						</Text>
					) : (
						<Text size="sm" c="dimmed">
							No nutrition details yet.
						</Text>
					)}
				</Stack>
			</Modal>

			<Modal
				opened={confirmDeleteOpen}
				onClose={closeConfirmDelete}
				centered
				size='sm'
				radius='md'
				title='Delete note?'
				overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
				styles={{
					content: {
						...panelStyle,
						background: colors.panel,
					},
					header: {
						background: colors.panel,
						borderBottom: `1px solid ${colors.panelBorder}`,
					},
					body: {
						background: colors.panel,
						paddingTop: 20,
					},
				}}>
				<Stack gap='md'>
					<Text
						size='sm'
						c='dimmed'>
						This will permanently delete “{displayTitle}”. This can’t be undone.
					</Text>
					<Group
						grow
						preventGrowOverflow={false}>
						<Button
							variant='default'
							onClick={closeConfirmDelete}
							disabled={deleting}>
							Cancel
						</Button>
						<Button
							variant='filled'
							color='orange'
							leftSection={<IconTrash size={16} />}
							loading={deleting}
							onClick={handleDelete}>
							Delete
						</Button>
					</Group>
				</Stack>
			</Modal>
		</>
	);
}
