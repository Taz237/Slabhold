"use client";

import { Check } from "lucide-react";
import {
  pollEnded,
  pollFooter,
  pollLeaders,
  pollPercents,
  pollResultLabel,
  pollShowsResults,
  type PollCounts,
  type PostPoll as Poll,
} from "@/lib/social/polls";

const ROW = "relative flex min-h-11 w-full items-center overflow-hidden rounded-xl px-3 py-2 text-left text-15 leading-5";

export type PostPollViewProps = {
  poll: Poll;
  authorId: string;
  /** Null when signed out. */
  viewerId: string | null;
  /** Null until the counts load. */
  counts: PollCounts | null;
  now: number;
  error?: string | null;
  /** Set after this viewer's vote saved, for the screen reader. */
  voted?: boolean;
  onVote: (optionId: string) => void;
  onSignIn: () => void;
};

/**
 * A poll under a post's text, the X way: the choices as buttons until you
 * vote, then bars with percents, your choice ticked and the leader in
 * semibold. The author, signed-out visitors and an ended poll see results.
 * Every row is the same height either way, so voting moves nothing.
 */
export function PostPollView({ poll, authorId, viewerId, counts, now, error, voted, onVote, onSignIn }: PostPollViewProps) {
  const signedIn = Boolean(viewerId);
  const isAuthor = viewerId === authorId;
  const ended = pollEnded(poll, now);
  const loaded = counts !== null;
  const showResults = pollShowsResults({
    signedIn,
    isAuthor,
    ended,
    viewerChoice: counts?.viewerChoice ?? null,
  });
  // Signed in and not yet known whether this viewer voted: the buttons wait.
  const waiting = signedIn && !isAuthor && !ended && !loaded;
  const percents = pollPercents(poll.options.map((option) => counts?.votes[option.id] ?? 0));
  const leaders = counts ? pollLeaders(poll, counts) : new Set<string>();

  return (
    <div
      role="group"
      aria-label="Poll"
      data-poll=""
      data-poll-state={showResults ? (ended ? "final" : "results") : "open"}
      className="mt-3"
    >
      <ul className="space-y-2">
        {poll.options.map((option, index) => {
          const percent = percents[index] ?? 0;
          const chosen = counts?.viewerChoice === option.id;
          const leading = leaders.has(option.id);
          if (!showResults) {
            return (
              <li key={option.id}>
                <button
                  type="button"
                  data-poll-choice=""
                  disabled={waiting}
                  aria-busy={waiting || undefined}
                  aria-label={`Vote for ${option.label}`}
                  onClick={() => onVote(option.id)}
                  className={`${ROW} justify-center rounded-full border border-violet-600 font-semibold text-violet-700 transition-colors active:bg-violet-500/10 disabled:opacity-50 dark:border-[#A78BFA] dark:text-[#A78BFA]`}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                </button>
              </li>
            );
          }
          const row = (
            <>
              <span
                aria-hidden="true"
                data-poll-bar=""
                style={{ width: `${loaded ? percent : 0}%` }}
                className={`absolute inset-y-0 left-0 origin-left rounded-xl ${
                  leading ? "bg-violet-500/25 dark:bg-violet-400/30" : "bg-zinc-200/80 dark:bg-white/10"
                } ${loaded ? "motion-safe:animate-[poll-bar_520ms_cubic-bezier(0.2,0.7,0.2,1)_backwards]" : ""}`}
              />
              <span
                aria-hidden="true"
                data-poll-label=""
                className={`relative flex min-w-0 flex-1 items-center gap-1.5 break-words ${leading ? "font-semibold" : ""}`}
              >
                {option.label}
                {chosen ? (
                  <Check data-poll-check="" className="h-4 w-4 shrink-0 text-violet-700 dark:text-[#A78BFA]" strokeWidth={2.5} />
                ) : null}
              </span>
              <span
                aria-hidden="true"
                data-poll-percent=""
                className={`relative ml-3 shrink-0 font-mono text-14 tabular-nums ${leading ? "font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}
              >
                {loaded ? `${percent}%` : <span className="skeleton-shimmer inline-block h-3 w-8 rounded-full align-middle" />}
              </span>
              <span className="sr-only">
                {loaded ? pollResultLabel(option.label, percent, chosen, leading) : option.label}
              </span>
            </>
          );
          return (
            <li key={option.id} data-poll-result="">
              {signedIn ? (
                <div className={ROW}>{row}</div>
              ) : (
                // Signed out: the results, and a tap asks you to sign in to vote.
                <button
                  type="button"
                  aria-describedby={`poll-signin-${poll.id}`}
                  onClick={onSignIn}
                  className={`${ROW} active:opacity-80`}
                >
                  {row}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p data-poll-footer="" className="mt-2 min-h-5 text-14 leading-5 text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {loaded ? (
          <>
            {pollFooter(counts.total, poll.endsAt, now)}
            {voted ? <span className="sr-only">. Vote saved.</span> : null}
          </>
        ) : (
          <span aria-hidden="true" className="skeleton-shimmer inline-block h-3.5 w-32 rounded-full align-middle" />
        )}
      </p>
      {!signedIn ? (
        <span id={`poll-signin-${poll.id}`} className="sr-only">
          Sign in to vote
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
