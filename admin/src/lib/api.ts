export class ApiError extends Error {
	status: number;
	data: unknown;

	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.status = status;
		this.data = data;
	}
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(path, {
		credentials: 'same-origin',
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...options.headers,
		},
		...options,
	});

	const text = await res.text();
	let data: unknown = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { raw: text };
		}
	}

	if (!res.ok) {
		const message =
			data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
				? data.error
				: res.statusText || 'Request failed';
		throw new ApiError(message, res.status, data);
	}

	return data as T;
}

export type Me = { email: string };

export type AdminStatus = {
	spotify: {
		configured: boolean;
		connected: boolean;
		monthKey: string;
		playlistName: string;
		playlistId: string | null;
		playlistUrl: string | null;
	};
	ticktick: {
		configured: boolean;
		connected: boolean;
		reminderEnabled: boolean;
		projectIdConfigured: boolean;
		timeOffProjectIdConfigured: boolean;
	};
	discord: { configured: boolean };
	film: {
		cloudinaryConfigured: boolean;
		anthropicConfigured: boolean;
	};
	google: {
		configured: boolean;
		adminEmailConfigured: boolean;
	};
	calendar: {
		oauthConfigured: boolean;
		connected: boolean;
		timeOffCalendarConfigured: boolean;
	};
};

export type SyncResult = {
	month: string;
	playlistId: string;
	added: string[];
	alreadyPresent: string[];
	topTracks: string[];
	weekRange: string;
	ticktickTaskCreated: boolean;
	discordMessageSent: boolean;
};

export type TickTickProject = { id: string; name: string };

export type GoogleCalendarSummary = { id: string; summary: string; primary?: boolean };

export type TimeOffEvent = {
	eventId: string;
	title: string;
	start: string;
	end: string;
	calendarId: string;
	status: 'reminder_created' | 'completed';
	ticktickTaskId?: string;
	ticktickProjectId?: string;
	reminderCreatedAt?: string;
	reminderDueDate?: string;
	completedAt?: string;
};

export type TimeOffSyncResult = {
	scanned: number;
	remindersCreated: number;
	completionsDetected: number;
	skipped: number;
	errors: string[];
};

export type FilmFolderSummary = {
	folder: string;
	lastUploadedAt: string;
	photoCount: number;
};

export type FilmPhotoItem = {
	publicId: string;
	displayName: string;
	secureUrl: string;
	assetFolder: string;
};

export type FilmPhotosPage = {
	folder: string;
	photos: FilmPhotoItem[];
	pageSize: number;
	total: number;
	totalPages: number;
	nextCursor: string | null;
};

export type FilmFoldersResponse = {
	folders: FilmFolderSummary[];
	defaultFolder: string | null;
};

export function listFilmFolders() {
	return api<FilmFoldersResponse>('/api/film/folders');
}

export function listFolderPhotos(folder: string, cursor?: string) {
	const params = new URLSearchParams({ folder });
	if (cursor) params.set('cursor', cursor);
	return api<FilmPhotosPage>(`/api/film/photos?${params.toString()}`);
}

export function rotatePhoto(publicId: string, assetFolder: string, angle: 90 | -90 | 180) {
	return api<{ photo: FilmPhotoItem }>('/api/film/photos/rotate', {
		method: 'POST',
		body: JSON.stringify({ publicId, assetFolder, angle }),
	});
}

export type FilmSessionSummary = {
	sessionId: string;
	folder: string;
	photoCount: number;
	index: number;
};

export type FilmSessionView = {
	sessionId: string;
	folder: string;
	index: number;
	total: number;
	checked: number;
	failed: number;
	photo: {
		publicId: string;
		displayName: string;
		secureUrl: string;
	} | null;
};

export function getMe() {
	return api<Me>('/api/me');
}

export function logout() {
	return api<{ ok: boolean }>('/api/logout', { method: 'POST' });
}

export function getStatus() {
	return api<AdminStatus>('/api/status');
}

export function syncSpotify() {
	return api<SyncResult>('/api/spotify/sync', { method: 'POST' });
}

export function setReminder(enabled: boolean) {
	return api<{ enabled: boolean }>('/api/ticktick/reminder', {
		method: 'PATCH',
		body: JSON.stringify({ enabled }),
	});
}

export function listProjects() {
	return api<TickTickProject[]>('/api/ticktick/projects');
}

export function testDiscord() {
	return api<{ sent: boolean }>('/api/discord/test', { method: 'POST' });
}

export function listCalendars() {
	return api<GoogleCalendarSummary[]>('/api/calendar/calendars');
}

export function listTimeOffEvents() {
	return api<{ events: TimeOffEvent[] }>('/api/time-off/events');
}

export function markTimeOffCompleted(eventId: string) {
	return api<TimeOffEvent>(`/api/time-off/events/${encodeURIComponent(eventId)}`, {
		method: 'PATCH',
		body: JSON.stringify({ status: 'completed' }),
	});
}

export function syncTimeOff() {
	return api<TimeOffSyncResult>('/api/time-off/sync', { method: 'POST' });
}

export function listFilmSessions() {
	return api<{ sessions: FilmSessionSummary[] }>('/api/film/sessions');
}

export function createFilmSession(folder: string) {
	return api<FilmSessionView>('/api/film/sessions', {
		method: 'POST',
		body: JSON.stringify({ folder }),
	});
}

export function getFilmSession(id: string) {
	return api<FilmSessionView>(`/api/film/sessions/${id}`);
}

export function navFilmSession(id: string, direction: 'prev' | 'next') {
	return api<FilmSessionView>(`/api/film/sessions/${id}/nav`, {
		method: 'POST',
		body: JSON.stringify({ direction }),
	});
}

export function rotateFilmSession(id: string, angle: 90 | -90 | 180) {
	return api<FilmSessionView>(`/api/film/sessions/${id}/rotate`, {
		method: 'POST',
		body: JSON.stringify({ angle }),
	});
}
