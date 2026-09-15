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

export function listFilmFavorites() {
	return api<{ publicIds: string[] }>('/api/film/favorites');
}

export function toggleFilmFavorite(publicId: string) {
	return api<{ publicId: string; favorite: boolean }>('/api/film/favorites/toggle', {
		method: 'POST',
		body: JSON.stringify({ publicId }),
	});
}

export type InstagramComposerDraft = {
	mode: 'stories' | 'post';
	folder: string | null;
	activeStoryIndex: number;
	stories: Array<{
		id: string;
		layout: 2 | 3 | 4 | 6;
		slots: Array<{
			publicId: string;
			secureUrl: string;
			displayName: string;
			assetFolder: string;
		} | null>;
	}>;
	post: {
		aspect: '4:5' | '1:1';
		photos: Array<{
			publicId: string;
			secureUrl: string;
			displayName: string;
			assetFolder: string;
		}>;
	};
};

export function getInstagramDraft() {
	return api<{ draft: InstagramComposerDraft | null }>('/api/instagram/draft');
}

export function saveInstagramDraft(draft: InstagramComposerDraft) {
	return api<{ draft: InstagramComposerDraft }>('/api/instagram/draft', {
		method: 'PUT',
		body: JSON.stringify({ draft }),
	});
}

export function clearInstagramDraft() {
	return api<{ ok: boolean }>('/api/instagram/draft', { method: 'DELETE' });
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

export type NutritionResult = {
	title?: string;
	calories: number | null;
	totalFatG: number | null;
	saturatedFatG: number | null;
	polyunsaturatedFatG: number | null;
	monounsaturatedFatG: number | null;
	transFatG: number | null;
	cholesterolMg: number | null;
	sodiumMg: number | null;
	potassiumMg: number | null;
	totalCarbsG: number | null;
	dietaryFiberG: number | null;
	sugarsG: number | null;
	addedSugarsG: number | null;
	proteinG: number | null;
	vitaminAPct: number | null;
	vitaminCPct: number | null;
	calciumPct: number | null;
	ironPct: number | null;
	vitaminDPct: number | null;
	sourcesExplanation: string;
};

export type NutritionItem = {
	id: string;
	name: string;
	status: 'idle' | 'calculating' | 'ready' | 'error';
	errorMessage?: string | null;
	result?: NutritionResult | null;
};

export type NutritionPhoto = {
	url: string;
	publicId: string;
};

export type NutritionEntry = {
	id: string;
	query: string;
	restaurant?: string | null;
	title?: string | null;
	description?: string | null;
	website?: string | null;
	photos?: NutritionPhoto[];
	photoUrl?: string | null;
	photoPublicId?: string | null;
	items?: NutritionItem[];
	status: 'idle' | 'calculating' | 'ready' | 'error';
	errorMessage?: string | null;
	result?: NutritionResult | null;
	mfpLoggedAt?: string | null;
	mfpJobId?: string | null;
	createdAt: string;
	updatedAt: string;
};

export type MfpJob = {
	id: string;
	entryId: string;
	status: 'queued' | 'running' | 'needs_input' | 'done' | 'error';
	logs: string[];
	errorMessage?: string | null;
	lastScreenshotBase64?: string | null;
	createdAt: string;
	updatedAt: string;
};

export const mfpJobQueryKey = (jobId: string) =>
	['mfp', 'job', jobId] as const;

export type MfpSessionStatus = {
	connected: boolean;
	emailMasked?: string | null;
	workerOnline?: boolean;
	workerHostname?: string | null;
	workerLastSeenAt?: string | null;
	browserBusy?: boolean;
	activeJobId?: string | null;
	activeEntryId?: string | null;
	activeJobStatus?: MfpJob['status'] | null;
};

export function listNutritionEntries() {
	return api<{ entries: NutritionEntry[] }>('/api/nutrition/entries');
}

export function createNutritionEntry(query?: string) {
	return api<{ entry: NutritionEntry }>('/api/nutrition/entries', {
		method: 'POST',
		body: JSON.stringify({ query: query ?? '' }),
	});
}

export function patchNutritionEntry(
	id: string,
	body: {
		query?: string;
		restaurant?: string | null;
		description?: string | null;
		website?: string | null;
	},
) {
	return api<{ entry: NutritionEntry }>(
		`/api/nutrition/entries/${encodeURIComponent(id)}`,
		{
			method: 'PATCH',
			body: JSON.stringify(body),
		},
	);
}

export function calculateNutritionEntry(id: string) {
	return api<{ entry: NutritionEntry }>(
		`/api/nutrition/entries/${encodeURIComponent(id)}/calculate`,
		{ method: 'POST' },
	);
}

export async function uploadNutritionPhotos(id: string, files: File[]) {
	const form = new FormData();
	for (const file of files) {
		form.append('photos', file);
	}
	const res = await fetch(
		`/api/nutrition/entries/${encodeURIComponent(id)}/photo`,
		{
			method: 'POST',
			credentials: 'same-origin',
			body: form,
		},
	);
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
	return data as { entry: NutritionEntry };
}

/** @deprecated Prefer uploadNutritionPhotos */
export async function uploadNutritionPhoto(id: string, file: File) {
	return uploadNutritionPhotos(id, [file]);
}

export function deleteNutritionEntry(id: string) {
	return api<{ ok: boolean }>(
		`/api/nutrition/entries/${encodeURIComponent(id)}`,
		{ method: 'DELETE' },
	);
}

export function getMfpSessionStatus() {
	return api<MfpSessionStatus>('/api/mfp/session/status');
}

export function saveMfpCredentials(email: string, password: string) {
	return api<{ ok: boolean; connected: boolean; emailMasked?: string }>(
		'/api/mfp/credentials',
		{
			method: 'PUT',
			body: JSON.stringify({ email, password }),
		},
	);
}

export function disconnectMfpSession() {
	return api<{ ok: boolean; connected: boolean }>('/api/mfp/session', {
		method: 'DELETE',
	});
}

export function cancelMfpBrowser() {
	return api<{ ok: boolean; cancelledJobId: string | null }>(
		'/api/mfp/browser/cancel',
		{ method: 'POST' },
	);
}

export function startMfpLog(entryId: string) {
	return api<{ job: MfpJob }>(
		`/api/nutrition/entries/${encodeURIComponent(entryId)}/mfp-log`,
		{ method: 'POST' },
	);
}

export function getMfpJob(jobId: string) {
	return api<{ job: MfpJob }>(
		`/api/mfp/jobs/${encodeURIComponent(jobId)}`,
	);
}

export function sendMfpJobInput(
	jobId: string,
	body: {
		text?: string;
		resume?: boolean;
	},
) {
	return api<{ job: MfpJob }>(
		`/api/mfp/jobs/${encodeURIComponent(jobId)}/input`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
	);
}
