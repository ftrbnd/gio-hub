import { Button } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type Props = {
	connected: boolean;
	href: string;
	serviceName: string;
	icon: ReactNode;
	color?: string;
	variant?: 'filled' | 'outline' | 'light';
};

export function ConnectButton({
	connected,
	href,
	serviceName,
	icon,
	color = 'forest',
	variant = 'filled',
}: Props) {
	return (
		<Button
			component="a"
			href={href}
			w="fit-content"
			color={connected ? 'teal' : color}
			variant={connected ? 'light' : variant}
			leftSection={connected ? <IconCheck size={18} /> : icon}
		>
			{connected ? `${serviceName} connected` : `Connect ${serviceName}`}
		</Button>
	);
}
