import { clockText, type NotificationPrefs } from "./prefs";

function minutesOf(clock: string): number | null {
  const text = clockText(clock);
  if (!text) return null;
  const [hours, minutes] = text.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim() || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock minute of the day in `zone`, DST included. Null for a bad zone. */
export function localMinutes(now: Date, zone: string): number | null {
  if (!isValidTimeZone(zone)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour % 24) * 60 + minute;
}

/**
 * True while the recipient's quiet hours are on. The window is local wall
 * time, so it follows DST, and a start after the end (22:00–08:00) crosses
 * midnight. Equal start and end, or a bad zone, is treated as no window.
 */
export function inQuietHours(
  prefs: Pick<NotificationPrefs, "quietEnabled" | "quietStart" | "quietEnd" | "timeZone">,
  now: Date,
): boolean {
  if (!prefs.quietEnabled) return false;
  const start = minutesOf(prefs.quietStart);
  const end = minutesOf(prefs.quietEnd);
  const current = localMinutes(now, prefs.timeZone);
  if (start === null || end === null || current === null || start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

/** This browser's zone, for saving with the quiet hours. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
