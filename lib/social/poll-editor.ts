import {
  POLL_MAX_DAYS,
  POLL_MAX_OPTIONS,
  POLL_MIN_MINUTES,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  pollMinutes,
  type PollDraft,
  type PollLength,
} from "./poll-draft";

/** The poll editor's moves. Only the editor's own chunk loads these. */

/** Which choice rows repeat an earlier one, by index. Shown under that field. */
export function repeatedChoices(options: readonly string[]): Set<number> {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  options.forEach((option, index) => {
    const key = option.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) repeats.add(index);
    seen.add(key);
  });
  return repeats;
}

export function canAddChoice(draft: Pick<PollDraft, "options">): boolean {
  return draft.options.length < POLL_MAX_OPTIONS;
}

export function addChoice(draft: PollDraft): PollDraft {
  if (!canAddChoice(draft)) return draft;
  return { ...draft, options: [...draft.options, ""] };
}

/** Removing is only offered past the first two, like X. */
export function removeChoice(draft: PollDraft, index: number): PollDraft {
  if (draft.options.length <= POLL_MIN_OPTIONS || index < POLL_MIN_OPTIONS) return draft;
  return { ...draft, options: draft.options.filter((_, at) => at !== index) };
}

/** Typing a choice: never past 25 characters. */
export function setChoice(draft: PollDraft, index: number, value: string): PollDraft {
  const clipped = [...value].slice(0, POLL_OPTION_MAX).join("");
  return { ...draft, options: draft.options.map((option, at) => (at === index ? clipped : option)) };
}

/**
 * The picker, kept in range the way X keeps it: 7 days means 0 hours and
 * 0 minutes, and anything under 5 minutes becomes 5 minutes.
 */
export function clampPollLength(length: PollLength): PollLength {
  const whole = (value: number, max: number) =>
    Math.min(max, Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0));
  const days = whole(length.days, POLL_MAX_DAYS);
  if (days === POLL_MAX_DAYS) return { days, hours: 0, minutes: 0 };
  const hours = whole(length.hours, 23);
  const minutes = whole(length.minutes, 59);
  if (pollMinutes({ days, hours, minutes }) < POLL_MIN_MINUTES) return { days, hours, minutes: POLL_MIN_MINUTES };
  return { days, hours, minutes };
}

/** Options for one wheel of the picker. */
export function pollLengthChoices(unit: keyof PollLength, length: PollLength): number[] {
  if (unit === "days") return Array.from({ length: POLL_MAX_DAYS + 1 }, (_, value) => value);
  if (length.days === POLL_MAX_DAYS) return [0];
  const max = unit === "hours" ? 23 : 59;
  const all = Array.from({ length: max + 1 }, (_, value) => value);
  if (unit === "minutes" && length.days === 0 && length.hours === 0) return all.filter((value) => value >= POLL_MIN_MINUTES);
  return all;
}
