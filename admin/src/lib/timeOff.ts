export function formatReminderDueDate(iso: string | undefined): string {
	if (!iso) return '—';
	const due = new Date(iso);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	due.setHours(0, 0, 0, 0);
	if (due.getTime() === today.getTime()) return 'Today (ASAP)';
	return due.toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}
