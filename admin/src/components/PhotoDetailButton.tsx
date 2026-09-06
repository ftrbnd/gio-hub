import { ActionIcon } from '@mantine/core';
import { IconMaximize } from '@tabler/icons-react';

type Props = {
	disabled?: boolean;
	size?: 'xs' | 'sm' | 'md';
	onOpen: () => void;
};

export function PhotoDetailButton({ disabled, size = 'sm', onOpen }: Props) {
	const iconSize = size === 'xs' ? 14 : 16;

	return (
		<ActionIcon
			size={size}
			variant="subtle"
			color="stone"
			disabled={disabled}
			aria-label="View photo details"
			onClick={(event) => {
				event.stopPropagation();
				onOpen();
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<IconMaximize size={iconSize} />
		</ActionIcon>
	);
}
