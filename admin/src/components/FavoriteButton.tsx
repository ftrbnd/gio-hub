import { ActionIcon } from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';

type Props = {
	favorite: boolean;
	disabled?: boolean;
	size?: 'xs' | 'sm' | 'md';
	onToggle: () => void;
};

export function FavoriteButton({
	favorite,
	disabled,
	size = 'sm',
	onToggle,
}: Props) {
	return (
		<ActionIcon
			size={size}
			variant="subtle"
			color={favorite ? 'yellow' : 'stone'}
			disabled={disabled}
			aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
			aria-pressed={favorite}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			{favorite ? <IconStarFilled size={size === 'xs' ? 14 : 16} /> : <IconStar size={size === 'xs' ? 14 : 16} />}
		</ActionIcon>
	);
}
