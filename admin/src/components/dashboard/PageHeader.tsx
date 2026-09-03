import { Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function PageHeader({
	title,
	icon,
}: {
	title: string;
	icon?: ReactNode;
}) {
	return (
		<Title order={2} c="brown.0">
			{icon ? (
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
					{icon}
					{title}
				</span>
			) : (
				title
			)}
		</Title>
	);
}
