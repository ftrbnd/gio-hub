import { Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function Row({
	label,
	icon,
	value,
}: {
	label: string;
	icon?: ReactNode;
	value: ReactNode;
}) {
	return (
		<Group justify="space-between">
			<Group gap={6}>
				{icon}
				<Text size="sm" c="dimmed">
					{label}
				</Text>
			</Group>
			{value}
		</Group>
	);
}
