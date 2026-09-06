import { useMemo, useRef, useState } from 'react';
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Grid, Group, SegmentedControl, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PageHeader } from '../components/dashboard/PageHeader';
import { BrandIcon } from '../components/BrandIcon';
import { LibraryPhotoOverlay } from '../components/instagram/DraggableLibraryPhoto';
import { PhotoLibraryPanel } from '../components/instagram/PhotoLibraryPanel';
import { PostComposer } from '../components/instagram/PostComposer';
import { StoryComposer } from '../components/instagram/StoryComposer';
import { useInstagramComposer } from '../hooks/useInstagramComposer';
import {
	carouselDragId,
	isDndData,
	isDndOverData,
	type DndData,
} from '../lib/instagram/dnd';
import type { ComposerMode, PlacedPhoto } from '../lib/instagram/types';

export function InstagramPage() {
	const { state, dispatch } = useInstagramComposer();
	const [activeDrag, setActiveDrag] = useState<DndData | null>(null);
	const lastDragEndAt = useRef(0);
	const isDesktop = useMediaQuery('(min-width: 62em)');

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const usedPublicIds = useMemo(() => {
		const ids = new Set<string>();
		for (const slide of state.stories) {
			for (const photo of slide.slots) {
				if (photo) ids.add(photo.publicId);
			}
		}
		for (const photo of state.post.photos) {
			ids.add(photo.publicId);
		}
		return ids;
	}, [state.stories, state.post.photos]);

	const carouselSortableIds = state.post.photos.map((p) => carouselDragId(p.publicId));

	function handleDragStart(event: DragStartEvent) {
		const data = event.active.data.current;
		if (isDndData(data)) setActiveDrag(data);
	}

	function handleDragEnd(event: DragEndEvent) {
		lastDragEndAt.current = Date.now();
		setActiveDrag(null);
		const { active, over } = event;
		if (!over) return;

		const activeData = active.data.current;
		if (!isDndData(activeData)) return;

		const overData = over.data.current;

		if (activeData.kind === 'carousel') {
			const overId = String(over.id);
			if (overId.startsWith('carousel:')) {
				const overPublicId = overId.slice('carousel:'.length);
				const from = activeData.index;
				const to = state.post.photos.findIndex((p) => p.publicId === overPublicId);
				if (from !== -1 && to !== -1 && from !== to) {
					dispatch({ type: 'REORDER_CAROUSEL', from, to });
				}
				return;
			}
		}

		if (!isDndOverData(overData)) return;

		if (overData.kind === 'carousel') {
			if (activeData.kind === 'library') {
				dispatch({
					type: 'ADD_TO_CAROUSEL',
					photo: activeData.photo,
					index: overData.index,
				});
			} else if (activeData.kind === 'slot') {
				dispatch({
					type: 'CLEAR_SLOT',
					slideId: activeData.slideId,
					slotIndex: activeData.slotIndex,
				});
				dispatch({
					type: 'ADD_TO_CAROUSEL',
					photo: activeData.photo,
					index: overData.index,
				});
			}
			return;
		}

		if (overData.kind !== 'slot') return;

		const { slideId, slotIndex } = overData;
		const targetSlide = state.stories.find((s) => s.id === slideId);
		const existing = targetSlide?.slots[slotIndex] ?? null;

		if (activeData.kind === 'library') {
			dispatch({ type: 'PLACE_IN_SLOT', slideId, slotIndex, photo: activeData.photo });
			return;
		}

		if (activeData.kind === 'carousel') {
			dispatch({ type: 'PLACE_IN_SLOT', slideId, slotIndex, photo: activeData.photo });
			dispatch({ type: 'REMOVE_FROM_CAROUSEL', index: activeData.index });
			return;
		}

		if (activeData.kind === 'slot') {
			if (activeData.slideId === slideId && activeData.slotIndex === slotIndex) return;

			if (activeData.slideId === slideId) {
				if (existing) {
					dispatch({
						type: 'SWAP_SLOTS',
						slideId,
						from: activeData.slotIndex,
						to: slotIndex,
					});
				} else {
					dispatch({ type: 'PLACE_IN_SLOT', slideId, slotIndex, photo: activeData.photo });
					dispatch({
						type: 'CLEAR_SLOT',
						slideId: activeData.slideId,
						slotIndex: activeData.slotIndex,
					});
				}
				return;
			}

			dispatch({ type: 'PLACE_IN_SLOT', slideId, slotIndex, photo: activeData.photo });
			dispatch({
				type: 'CLEAR_SLOT',
				slideId: activeData.slideId,
				slotIndex: activeData.slotIndex,
			});
			if (existing) {
				dispatch({
					type: 'PLACE_IN_SLOT',
					slideId: activeData.slideId,
					slotIndex: activeData.slotIndex,
					photo: existing,
				});
			}
		}
	}

	function overlayPhoto(): PlacedPhoto | null {
		if (!activeDrag) return null;
		switch (activeDrag.kind) {
			case 'library':
			case 'slot':
			case 'carousel':
				return activeDrag.photo;
		}
	}

	const overlay = overlayPhoto();

	// Header (64) + AppShell padding (md×2) + Container py (md×2)
	const workspaceHeight =
		'calc(100dvh - var(--app-shell-header-offset, 64px) - (var(--mantine-spacing-md) * 4))';

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<Stack
				gap="md"
				style={
					isDesktop
						? {
								height: workspaceHeight,
								maxHeight: workspaceHeight,
								overflow: 'hidden',
							}
						: undefined
				}
			>
				<Group align="center" gap="md" wrap="wrap" style={{ flexShrink: 0 }}>
					<PageHeader
						title="Instagram"
						icon={<BrandIcon brand="instagram" size={24} />}
					/>
					<SegmentedControl
						value={state.mode}
						onChange={(value) =>
							dispatch({ type: 'SET_MODE', mode: value as ComposerMode })
						}
						data={[
							{ value: 'stories', label: 'Stories' },
							{ value: 'post', label: 'Post' },
						]}
						color="forest"
					/>
				</Group>

				<Grid
					gap="md"
					align="stretch"
					style={{ flex: 1, minHeight: 0, width: '100%' }}
					styles={{
						inner: { height: '100%', minHeight: 0 },
					}}
				>
					<Grid.Col
						span={{ base: 12, md: 5 }}
						h={isDesktop ? '100%' : undefined}
						style={{ display: 'flex', minHeight: 0 }}
					>
						<PhotoLibraryPanel
							folder={state.folder}
							dispatch={dispatch}
							usedPublicIds={usedPublicIds}
							onAddPhoto={(photo) => {
								// Ignore click that follows a drag release.
								if (Date.now() - lastDragEndAt.current < 200) return;
								dispatch({ type: 'PLACE_NEXT', photo });
							}}
						/>
					</Grid.Col>
					<Grid.Col
						span={{ base: 12, md: 7 }}
						h={isDesktop ? '100%' : undefined}
						style={{ display: 'flex', minHeight: 0 }}
					>
						<Box
							style={{
								flex: 1,
								minHeight: 0,
								overflowY: isDesktop ? 'auto' : undefined,
								width: '100%',
							}}
						>
							<SortableContext
								items={carouselSortableIds}
								strategy={verticalListSortingStrategy}
							>
								{state.mode === 'stories' ? (
									<StoryComposer state={state} dispatch={dispatch} />
								) : (
									<PostComposer state={state} dispatch={dispatch} />
								)}
							</SortableContext>
						</Box>
					</Grid.Col>
				</Grid>
			</Stack>

			<DragOverlay dropAnimation={null}>
				{overlay ? <LibraryPhotoOverlay photo={overlay} /> : null}
			</DragOverlay>
		</DndContext>
	);
}
