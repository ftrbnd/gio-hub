import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { getStatus, type AdminStatus } from '../lib/api';

export function useAdminStatus() {
	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		const next = await getStatus();
		setStatus(next);
		return next;
	}, []);

	useEffect(() => {
		void refresh()
			.catch((err) => {
				notifications.show({
					color: 'forest',
					title: 'Status failed',
					message: err instanceof Error ? err.message : 'Unknown error',
				});
			})
			.finally(() => setLoading(false));
	}, [refresh]);

	return { status, loading, refresh };
}
