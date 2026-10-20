import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export const DATE_FORMAT = 'YYYY-MM-DD';

/** API timestamps are ISO-8601 UTC; treat strings without an offset as UTC too. */
export function parseTimestamp(value: string): Dayjs {
  return dayjs.utc(value).local();
}

/** `due_date` is a plain calendar date (YYYY-MM-DD), parsed in local time. */
export function parseDueDate(value: string): Dayjs {
  return dayjs(value, DATE_FORMAT);
}

export type DueStatus = 'overdue' | 'soon' | 'normal';

export function isDoneColumnTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'done';
}

/**
 * overdue: due date before today (and the card is not in a "Done" column)
 * soon:    due today or within the next 2 days (and not in a "Done" column)
 */
export function getDueStatus(dueDate: string, inDoneColumn: boolean): DueStatus {
  if (inDoneColumn) return 'normal';
  const today = dayjs().startOf('day');
  const diffDays = parseDueDate(dueDate).startOf('day').diff(today, 'day');
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'soon';
  return 'normal';
}

export function formatDueDate(dueDate: string): string {
  const d = parseDueDate(dueDate);
  return d.year() === dayjs().year() ? d.format('MMM D') : d.format('MMM D, YYYY');
}

export { dayjs };
