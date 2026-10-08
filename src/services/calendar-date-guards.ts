// Calendar availability belongs to the Philippine studio, regardless of device timezone.
export const STUDIO_TIME_ZONE = 'Asia/Manila';
const studioClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function getStudioDateTime(now = new Date()) {
  const parts = Object.fromEntries(studioClock.formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

export function isValidCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function getCalendarDayValidationError(date: string, now = new Date()): string | null {
  if (!isValidCalendarDate(date)) return 'Please select a valid calendar date.';
  return date < getStudioDateTime(now).date ? 'Past dates are read-only. Select today or a future date.' : null;
}

export function getCalendarSlotValidationError(
  date: string, startTime: string, endTime: string, now = new Date(),
): string | null {
  const dayError = getCalendarDayValidationError(date, now);
  if (dayError) return dayError;
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  if (!validTime.test(startTime) || !validTime.test(endTime)) return 'Please enter a valid start and end time.';
  if (startTime >= endTime) return 'End time must be later than start time.';
  const clock = getStudioDateTime(now);
  return date === clock.date && startTime <= clock.time
    ? 'This start time has already passed. Choose a later time.' : null;
}
