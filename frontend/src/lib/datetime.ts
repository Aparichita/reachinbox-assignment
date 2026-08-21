function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format a Date for `<input type="datetime-local" />` (local time, no zone). */
export function toDatetimeLocalValue(date: Date): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

/**
 * Convert a datetime-local value to an ISO UTC string for the backend.
 * `datetime-local` returns local wall time without a zone; `new Date(value)`
 * interprets that as local time, and `toISOString()` converts to UTC.
 */
export function localDatetimeToIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function isFutureLocalDatetime(localValue: string): boolean {
  const timestamp = new Date(localValue).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function getInMinutesPreset(minutes: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return toDatetimeLocalValue(date);
}

export function getTomorrowAtPreset(hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return toDatetimeLocalValue(date);
}
