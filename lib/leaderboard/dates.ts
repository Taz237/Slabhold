import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

/** Calendar shift of a YYYY-MM-DD date. Does not depend on the host timezone. */
export function addDaysToYmd(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function leaderboardDates(now: Date = new Date()): {
  today: string;
  yesterday: string;
  weekAgo: string;
} {
  const today = snapshotDateInNewYork(now);
  return {
    today,
    yesterday: addDaysToYmd(today, -1),
    weekAgo: addDaysToYmd(today, -7),
  };
}

/** "Oct 22" from a snapshot date. UTC calendar so server and browser match. */
export function formatSnapshotDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function isNewYorkMonday(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return weekday === "Mon";
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function newYorkWeekdayIndex(ymd: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(`${ymd}T16:00:00.000Z`));
  return WEEKDAY_INDEX[weekday] ?? 0;
}

/** The Sunday before this New York date. A Sunday itself goes back a full week. */
export function previousSunday(ymd: string): string {
  return addDaysToYmd(ymd, -(newYorkWeekdayIndex(ymd) + 1));
}

/**
 * Monday–Sunday week in America/New_York.
 * `start` is the previous Sunday's snapshot date. `end` is the New York day of `now`.
 * Past snapshot dates are not rewritten here.
 */
export function currentValueWeek(now: Date = new Date()): { start: string; end: string } {
  const end = snapshotDateInNewYork(now);
  return { start: previousSunday(end), end };
}

/**
 * End is the latest cron-completed snapshot strictly before today.
 * A same-day /collection visit is not a week end. When that snapshot is not
 * after the previous Sunday, use the prior finished week. Monday stays on
 * last week's board until a snapshot from an earlier date exists.
 */
export function resolveValueWeek(input: {
  today: string;
  latest: string | null;
}): { start: string; end: string } {
  const start = previousSunday(input.today);
  const latest =
    input.latest && /^\d{4}-\d{2}-\d{2}$/.test(input.latest) && input.latest < input.today
      ? input.latest
      : null;
  if (!latest || latest <= start) {
    return { start: addDaysToYmd(start, -7), end: start };
  }
  return { start, end: latest };
}

/** "Oct 19–Oct 23" from snapshot dates. UTC calendar so server and browser match. */
export function formatWeekLabel(start: string, end: string): string {
  if (start === end) return formatSnapshotDate(start);
  return `${formatSnapshotDate(start)}–${formatSnapshotDate(end)}`;
}
