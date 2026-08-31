import { useQuery } from '@tanstack/react-query';
import { ApiError, getMe } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export function useMe() {
	return useQuery({
		queryKey: queryKeys.me(),
		queryFn: async () => {
			try {
				return await getMe();
			} catch (err) {
				if (err instanceof ApiError && err.status === 401) {
					return null;
				}
				throw err;
			}
		},
	});
}
