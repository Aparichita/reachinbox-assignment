function toUtcDate(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const isoValue = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  return new Date(isoValue);
}

export function formatUtcDateTime(value: string): string {
  const date = toUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatLastSyncedAt(value: Date | null): string {
  if (!value) {
    return "Not synced yet";
  }

  return `Last synced at ${value.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
