import { Group, Paper, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { panelStyleAccent } from '../../theme';

export function StatusCard({
	title,
	icon,
	children,
}: {
	title: string;
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Paper p="md" radius="md" style={panelStyleAccent}>
			<Group gap="xs" mb="sm" align="center">
				{icon}
				<Text
					size="xs"
					tt="uppercase"
					fw={700}
					c="denim.3"
					style={{ letterSpacing: '0.06em' }}
				>
					{title}
				</Text>
			</Group>
			<Stack gap={8}>{children}</Stack>
		</Paper>
	);
}
