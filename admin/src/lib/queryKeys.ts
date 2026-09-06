export const queryKeys = {
	me: () => ['me'] as const,
	status: () => ['status'] as const,
	film: {
		all: ['film'] as const,
		folders: () => ['film', 'folders'] as const,
		photos: (folder: string, page: number) => ['film', 'photos', folder, page] as const,
		photosAll: (folder: string) => ['film', 'photos-all', folder] as const,
		favorites: () => ['film', 'favorites'] as const,
	},
	instagram: {
		draft: () => ['instagram', 'draft'] as const,
	},
};
