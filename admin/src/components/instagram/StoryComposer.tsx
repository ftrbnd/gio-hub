import { useState } from 'react';
import {
	ActionIcon,
	Button,
	Group,
	Paper,
	SegmentedControl,
	Stack,
	Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ComposerDispatch } from '../../hooks/useInstagramComposer';
import {
	downloadStorySlide,
	storyHasPhotos,
} from '../../lib/instagram/exportStory';
import { STORY_LAYOUT_OPTIONS } from '../../lib/instagram/layouts';
import type {
	ComposerState,
	StoryLayout,
	StorySlide,
} from '../../lib/instagram/types';
import { StoryPreview } from './StoryPreview';
import { panelStyle } from '../../theme';

type Props = {
	state: ComposerState;
	dispatch: ComposerDispatch;
};

export function StoryComposer({ state, dispatch }: Props) {
	const { stories, activeStoryIndex } = state;
	const activeSlide = stories[activeStoryIndex];
	const [downloadingId, setDownloadingId] = useState<string | null>(null);

	if (!activeSlide) return null;

	async function handleDownload(slide: StorySlide, index: number) {
		if (!storyHasPhotos(slide) || downloadingId) return;
		setDownloadingId(slide.id);
		try {
			await downloadStorySlide(slide, index + 1);
			notifications.show({
				color: 'teal',
				title: 'Downloaded',
				message: `Saved story-${String(index + 1).padStart(2, '0')}.jpg`,
			});
		} catch (err) {
			notifications.show({
				color: 'red',
				title: 'Download failed',
				message: err instanceof Error ? err.message : 'Could not export story',
			});
		} finally {
			setDownloadingId(null);
		}
	}

	return (
		<Stack gap='md'>
			<Paper
				p='md'
				radius='md'
				style={panelStyle}>
				<Stack gap='md'>
					<Group
						justify='space-between'
						align='center'>
						<Text
							size='sm'
							fw={600}>
							Layout
						</Text>
						<SegmentedControl
							size='xs'
							value={String(activeSlide.layout)}
							onChange={(value) =>
								dispatch({
									type: 'SET_STORY_LAYOUT',
									slideId: activeSlide.id,
									layout: Number(value) as StoryLayout,
								})
							}
							data={STORY_LAYOUT_OPTIONS.map((n) => ({
								value: String(n),
								label: String(n),
							}))}
							color='forest'
						/>
					</Group>

					<StoryPreview
						slide={activeSlide}
						onClearSlot={(slotIndex) =>
							dispatch({
								type: 'CLEAR_SLOT',
								slideId: activeSlide.id,
								slotIndex,
							})
						}
					/>

					<Button
						size='sm'
						color='forest'
						variant='light'
						leftSection={<IconDownload size={16} />}
						disabled={!storyHasPhotos(activeSlide) || downloadingId !== null}
						loading={downloadingId === activeSlide.id}
						onClick={() => handleDownload(activeSlide, activeStoryIndex)}>
						Download story
					</Button>
				</Stack>
			</Paper>

			<Paper
				p='md'
				radius='md'
				style={panelStyle}>
				<Stack gap='sm'>
					<Group justify='space-between'>
						<Text
							size='sm'
							fw={600}>
							Stories ({stories.length})
						</Text>
						<Button
							size='xs'
							variant='light'
							color='forest'
							leftSection={<IconPlus size={14} />}
							onClick={() => dispatch({ type: 'ADD_STORY' })}>
							Add story
						</Button>
					</Group>

					<Group
						gap='xs'
						wrap='wrap'>
						{stories.map((slide, index) => {
							const filled = slide.slots.filter(Boolean).length;
							const isActive = index === activeStoryIndex;
							const canDownload = storyHasPhotos(slide);
							return (
								<Paper
									key={slide.id}
									p='xs'
									radius='sm'
									onClick={() => dispatch({ type: 'SET_ACTIVE_STORY', index })}
									style={{
										...panelStyle,
										cursor: 'pointer',
										minWidth: 72,
										border: isActive
											? '1px solid var(--mantine-color-denim-5)'
											: panelStyle.border,
										background: isActive
											? 'var(--mantine-color-denim-9)'
											: undefined,
									}}>
									<Group
										gap={4}
										justify='space-between'
										wrap='nowrap'>
										<Text
											size='xs'
											fw={600}>
											{index + 1}
										</Text>
										<Group
											gap={2}
											wrap='nowrap'>
											{canDownload && (
												<ActionIcon
													size='xs'
													variant='subtle'
													color='forest'
													loading={downloadingId === slide.id}
													disabled={downloadingId !== null}
													onClick={(e) => {
														e.stopPropagation();
														void handleDownload(slide, index);
													}}
													aria-label={`Download story ${index + 1}`}>
													<IconDownload size={12} />
												</ActionIcon>
											)}
											{stories.length > 1 && (
												<ActionIcon
													size='xs'
													variant='subtle'
													color='stone'
													onClick={(e) => {
														e.stopPropagation();
														dispatch({
															type: 'REMOVE_STORY',
															slideId: slide.id,
														});
													}}
													aria-label={`Remove story ${index + 1}`}>
													<IconTrash size={12} />
												</ActionIcon>
											)}
										</Group>
									</Group>
									<Text
										size='xs'
										c='dimmed'>
										{filled}/{slide.layout}
									</Text>
								</Paper>
							);
						})}
					</Group>
				</Stack>
			</Paper>
		</Stack>
	);
}
