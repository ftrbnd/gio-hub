export type TimeOffEventStatus = 'reminder_created' | 'completed';

export type TimeOffEventRecord = {
	eventId: string;
	title: string;
	start: string;
	end: string;
	calendarId: string;
	status: TimeOffEventStatus;
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
