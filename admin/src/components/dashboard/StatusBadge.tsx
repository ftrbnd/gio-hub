import { Badge } from '@mantine/core';

export function StatusBadge({
	ok,
	okLabel = 'Ready',
	badLabel = 'Missing',
}: {
	ok: boolean;
	okLabel?: string;
	badLabel?: string;
}) {
	return (
		<Badge color={ok ? 'teal' : 'orange'} variant="light" size="sm">
			{ok ? okLabel : badLabel}
		</Badge>
	);
}
