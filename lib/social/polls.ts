/**
 * Polls on posts, the way X does them. This file is what a timeline needs to
 * draw one; writing a poll lives in ./poll-draft and the server in ./poll-remote.
 *
 * The database keeps three tables (polls, poll_options, poll_votes) and a
 * frozen copy of the poll on posts.meta.poll: { id, ends_at, options: [{ id, label }] }.
 * That copy rides along with every post read, so a timeline draws the poll's
 * rows at once. The counts and the viewer's own vote load after, in batches.
 */

import type { PostPoll } from "./poll-meta";

export { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, pollField, pollFromMeta } from "./poll-meta";
export type { PollOption, PostPoll } from "./poll-meta";

/** Live numbers for one poll, from public.poll_results. */
export type PollCounts = {
  total: number;
  /** Votes per option id. */
  votes: Record<string, number>;
  /** The viewer's choice, or null before they vote (always null signed out). */
  viewerChoice: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A remote poll id: only these go to public.poll_results. */
export function isRemotePollId(id: string): boolean {
  return UUID.test(id);
}

// ---------------------------------------------------------------------------
// Showing a poll
// ---------------------------------------------------------------------------

export function pollEnded(poll: Pick<PostPoll, "endsAt">, now: number): boolean {
  const ends = Date.parse(poll.endsAt);
  return !Number.isFinite(ends) || ends <= now;
}

/**
 * Results once the viewer voted, for the author, once the poll ended, and
 * for anyone signed out. Everyone else gets the choices as buttons.
 */
export function pollShowsResults(view: {
  signedIn: boolean;
  isAuthor: boolean;
  viewerChoice: string | null;
  ended: boolean;
}): boolean {
  return !view.signedIn || view.isAuthor || view.ended || Boolean(view.viewerChoice);
}

/**
 * Whole percents that add up to exactly 100 (or all 0 with no votes):
 * each gets its floor, then the biggest remainders get the spare points.
 * Ties go to the earlier choice.
 */
export function pollPercents(votes: readonly number[]): number[] {
  const clean = votes.map((value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0));
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (total === 0) return clean.map(() => 0);
  const exact = clean.map((value) => (value * 100) / total);
  const floors = exact.map(Math.floor);
  let spare = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (spare <= 0) break;
    floors[index]! += 1;
    spare -= 1;
  }
  return floors;
}

/** The leading choices (ties all lead). Empty before anyone votes. */
export function pollLeaders(poll: Pick<PostPoll, "options">, counts: Pick<PollCounts, "votes">): Set<string> {
  const values = poll.options.map((option) => counts.votes[option.id] ?? 0);
  const top = Math.max(0, ...values);
  if (top === 0) return new Set();
  return new Set(poll.options.filter((_, index) => values[index] === top).map((option) => option.id));
}

/** "2 days left", "1 hour left", "12 minutes left", "Final results". */
export function pollTimeLeft(endsAt: string, now: number): string {
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(ends) || ends <= now) return "Final results";
  const minutes = Math.max(1, Math.ceil((ends - now) / 60_000));
  const plural = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"} left`;
  if (minutes >= 24 * 60) return plural(Math.floor(minutes / (24 * 60)), "day");
  if (minutes >= 60) return plural(Math.floor(minutes / 60), "hour");
  return plural(minutes, "minute");
}

/** "1 vote", "1,234 votes". */
export function pollVoteCount(total: number): string {
  const whole = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  return `${whole.toLocaleString("en-US")} ${whole === 1 ? "vote" : "votes"}`;
}

/** The line under a poll: "123 votes · 2 days left". */
export function pollFooter(total: number, endsAt: string, now: number): string {
  return `${pollVoteCount(total)} · ${pollTimeLeft(endsAt, now)}`;
}

/** How long until the footer's words change, so a timer can wake then. Null once it ended. */
export function pollNextTick(endsAt: string, now: number): number | null {
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(ends) || ends <= now) return null;
  const left = ends - now;
  // Under an hour the minutes count down; past that a minute's accuracy is plenty.
  return Math.max(1_000, Math.min(left, 60_000 - (now % 60_000)));
}

/** The counts after the viewer votes, before the server answers. */
export function withVote(counts: PollCounts, optionId: string): PollCounts {
  if (counts.viewerChoice) return counts;
  return {
    total: counts.total + 1,
    votes: { ...counts.votes, [optionId]: (counts.votes[optionId] ?? 0) + 1 },
    viewerChoice: optionId,
  };
}

/** What a screen reader hears for one result row. */
export function pollResultLabel(label: string, percent: number, chosen: boolean, leading: boolean): string {
  return `${label}, ${percent}%${chosen ? ", your vote" : ""}${leading ? ", leading" : ""}`;
}
