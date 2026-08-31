export const queryKeys = {
	me: () => ['me'] as const,
	status: () => ['status'] as const,
	film: {
		all: ['film'] as const,
		folders: () => ['film', 'folders'] as const,
		photos: (folder: string, page: number) => ['film', 'photos', folder, page] as const,
	},
};
