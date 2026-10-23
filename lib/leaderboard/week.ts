import {
  FINAL_LABEL,
  FINAL_WEEKDAY,
  LEADERBOARD_TIME_ZONE,
  PROVISIONAL_LABEL,
  WEEK_START_WEEKDAY,
} from "./rules";

export type WeekWindow = {
  start: Date;
  end: Date;
  /** Tuesday 00:00 in the leaderboard zone, after this week ends. */
  finalAt: Date;
  startDate: string;
  endDate: string;
  label: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function zonedParts(date: Date, timeZone = LEADERBOARD_TIME_ZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: WEEKDAY_INDEX[bag.weekday] ?? 0,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function offsetMs(timeZone: string, utcMs: number): number {
  const parts = zonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

/** Civil time in the zone, as a UTC instant. Midnight is not a DST gap. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone = LEADERBOARD_TIME_ZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - offsetMs(timeZone, guess);
  utc = guess - offsetMs(timeZone, utc);
  return new Date(utc);
}

function dateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function midnight(date: string, timeZone: string): Date {
  const { year, month, day } = dateParts(date);
  return zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(date: string): string {
  const { month, day } = dateParts(date);
  return `${MONTHS[month - 1]} ${day}`;
}

export function weekContaining(now: Date, timeZone = LEADERBOARD_TIME_ZONE): WeekWindow {
  const parts = zonedParts(now, timeZone);
  const today = isoDate(parts.year, parts.month, parts.day);
  const daysSinceStart = (parts.weekday - WEEK_START_WEEKDAY + 7) % 7;
  const startDate = addCalendarDays(today, -daysSinceStart);
  const endDate = addCalendarDays(startDate, 6);
  const nextStart = addCalendarDays(startDate, 7);
  const finalDate = addCalendarDays(nextStart, (FINAL_WEEKDAY - WEEK_START_WEEKDAY + 7) % 7);
  return {
    start: midnight(startDate, timeZone),
    end: midnight(nextStart, timeZone),
    finalAt: midnight(finalDate, timeZone),
    startDate,
    endDate,
    label: `${shortDate(startDate)} – ${shortDate(endDate)}`,
  };
}

export function previousWeek(now: Date, timeZone = LEADERBOARD_TIME_ZONE): WeekWindow {
  const current = weekContaining(now, timeZone);
  return weekContaining(new Date(current.start.getTime() - 1), timeZone);
}

export function inWeek(instant: Date, week: WeekWindow): boolean {
  const time = instant.getTime();
  return time >= week.start.getTime() && time < week.end.getTime();
}

export function weekStanding(week: WeekWindow, now: Date): typeof PROVISIONAL_LABEL | typeof FINAL_LABEL {
  return now.getTime() >= week.finalAt.getTime() ? FINAL_LABEL : PROVISIONAL_LABEL;
}

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
  /** True when the Monday reset instant has been reached. */
  done: boolean;
};

export function countdownTo(resetsAt: Date, now: Date): Countdown {
  const ms = Math.max(0, resetsAt.getTime() - now.getTime());
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const hh = pad(hours);
  const mm = pad(minutes);
  const ss = pad(seconds);
  return {
    days,
    hours,
    minutes,
    seconds,
    done: ms === 0,
    label: `Resets in ${days}d ${hh}h ${mm}m ${ss}s`,
  };
}
