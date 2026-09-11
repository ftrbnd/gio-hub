import { useEffect, useRef, useState } from 'react';
import {
	ActionIcon,
	Box,
	Button,
	FileButton,
	Group,
	Paper,
	Stack,
	Textarea,
} from '@mantine/core';
import { IconPhoto, IconSend, IconX } from '@tabler/icons-react';
import { colors } from '../../theme';

export const NUTRITION_DRAFT_PLACEHOLDER = 'Vienna Latte from Yeems Coffee';

const MAX_DRAFT_PHOTOS = 10;

const draftPanelStyle = {
	background: colors.panelSelected,
	border: `1px solid ${colors.denimBorder}`,
	boxShadow: `0 0 0 1px ${colors.denimGlow}`,
} as const;

type DraftPhoto = {
	file: File;
	url: string;
};

type Props = {
	onCommit: (query: string, photos: File[]) => Promise<void>;
	disabled?: boolean;
};

export function NutritionDraftComposer({ onCommit, disabled }: Props) {
	const [query, setQuery] = useState('');
	const [photos, setPhotos] = useState<DraftPhoto[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const photosRef = useRef(photos);
	photosRef.current = photos;

	useEffect(() => {
		return () => {
			for (const photo of photosRef.current) {
				URL.revokeObjectURL(photo.url);
			}
		};
	}, []);

	const addPhotos = (files: File[] | null) => {
		if (!files?.length) return;
		setPhotos((current) => {
			const remaining = MAX_DRAFT_PHOTOS - current.length;
			if (remaining <= 0) return current;
			const next = files.slice(0, remaining).map((file) => ({
				file,
				url: URL.createObjectURL(file),
			}));
			return [...current, ...next];
		});
	};

	const removePhoto = (index: number) => {
		setPhotos((current) => {
			const target = current[index];
			if (target) URL.revokeObjectURL(target.url);
			return current.filter((_, i) => i !== index);
		});
	};

	const handleSubmit = async () => {
		const trimmed = query.trim();
		if (!trimmed || submitting || disabled) return;

		const pending = photos;
		setSubmitting(true);
		setQuery('');
		setPhotos([]);

		try {
			await onCommit(
				trimmed,
				pending.map((photo) => photo.file),
			);
			for (const photo of pending) {
				URL.revokeObjectURL(photo.url);
			}
		} catch {
			setQuery((current) => (current.trim() ? current : trimmed));
			setPhotos((current) => (current.length > 0 ? current : pending));
		} finally {
			setSubmitting(false);
		}
	};

	const canAddPhotos = photos.length < MAX_DRAFT_PHOTOS;
	const canSubmit = query.trim().length > 0 && !submitting && !disabled;

	return (
		<Paper p="md" radius="md" style={draftPanelStyle}>
			<Stack gap="sm">
				<Textarea
					placeholder={NUTRITION_DRAFT_PLACEHOLDER}
					value={query}
					onChange={(e) => setQuery(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							void handleSubmit();
						}
					}}
					autosize
					minRows={2}
					maxRows={6}
					variant="unstyled"
					disabled={disabled || submitting}
					autoFocus
					styles={{
						input: {
							color: colors.text,
							fontSize: 16,
							lineHeight: 1.45,
							padding: 0,
							fontStyle: 'italic',
						},
					}}
				/>

				{photos.length > 0 ? (
					<Box
						style={{
							display: 'flex',
							gap: 8,
							overflowX: 'auto',
							paddingBottom: 2,
							WebkitOverflowScrolling: 'touch',
						}}
					>
						{photos.map((photo, index) => (
							<Box
								key={photo.url}
								style={{ position: 'relative', flexShrink: 0 }}
							>
								<img
									src={photo.url}
									alt=""
									style={{
										width: 64,
										height: 64,
										borderRadius: 8,
										objectFit: 'cover',
										border: `1px solid ${colors.panelBorder}`,
										display: 'block',
									}}
								/>
								<ActionIcon
									size="xs"
									radius="xl"
									variant="filled"
									color="dark"
									aria-label="Remove photo"
									disabled={disabled || submitting}
									onClick={() => removePhoto(index)}
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
				) : null}

				<Group justify="space-between" align="center">
					{canAddPhotos ? (
						<FileButton
							accept="image/jpeg,image/png,image/gif,image/webp"
							multiple
							onChange={addPhotos}
							disabled={disabled || submitting}
						>
							{(props) => (
								<ActionIcon
									{...props}
									variant="subtle"
									color="stone"
									size="lg"
									aria-label="Add photos"
									disabled={disabled || submitting}
								>
									<IconPhoto size={20} />
								</ActionIcon>
							)}
						</FileButton>
					) : (
						<span />
					)}
					<Button
						size="sm"
						variant="light"
						color="forest"
						leftSection={<IconSend size={16} />}
						loading={submitting}
						disabled={!canSubmit}
						onClick={() => {
							void handleSubmit();
						}}
					>
						Submit
					</Button>
				</Group>
			</Stack>
		</Paper>
	);
}
