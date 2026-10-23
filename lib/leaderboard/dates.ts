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

/** Monday–Sunday window in America/New_York. `end` is the New York calendar day of `now`. */
export function currentValueWeek(now: Date = new Date()): { start: string; end: string } {
  const end = snapshotDateInNewYork(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(`${end}T16:00:00.000Z`));
  const index = WEEKDAY_INDEX[weekday] ?? 0;
  return { start: addDaysToYmd(end, -index), end };
}

/** "Oct 19–Oct 23" from snapshot dates. UTC calendar so server and browser match. */
export function formatWeekLabel(start: string, end: string): string {
  if (start === end) return formatSnapshotDate(start);
  return `${formatSnapshotDate(start)}–${formatSnapshotDate(end)}`;
}
