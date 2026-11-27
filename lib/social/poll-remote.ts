import type { SupabaseClient } from "@supabase/supabase-js";
import { VOTE_REFUSAL_COPY, type PollBackend, type VoteRefusal } from "./poll-store";
import { announcePollsSettled } from "./poll-meta";
import { isRemotePollId, type PollCounts } from "./polls";
import {
  POLL_CHOICE_COUNT,
  POLL_CHOICE_REPEAT,
  POLL_CHOICE_TOO_LONG,
  POLL_LENGTH_ERROR,
  POLL_QUESTION_REQUIRED,
  POLL_VOTE_ERROR,
  pollChoices,
  pollMinutes,
  POLLS_UNAVAILABLE,
  type PollDraft,
} from "./poll-draft";
import { pollsMissing } from "./poll-support";

type RpcClient = Pick<SupabaseClient, "rpc">;

/** Counts from public.poll_results, votes through public.vote_in_poll. */
export function remotePollBackend(supabase: RpcClient): PollBackend {
  return {
    async load(ids) {
      const wanted = ids.filter(isRemotePollId);
      if (wanted.length === 0) return new Map<string, PollCounts>();
      const { data, error } = await supabase.rpc("poll_results", { p_poll_ids: wanted });
      if (error) {
        // Not installed yet: the polls show with no counts rather than failing.
        if (pollsMissing(error)) return new Map<string, PollCounts>();
        throw new Error(error.message);
      }
      return pollCountsFromRows(data);
    },
    async vote(pollId, optionId) {
      const { data, error } = await supabase.rpc("vote_in_poll", { p_option_id: optionId });
      if (error) {
        const refusal = pollRefusal(error);
        return {
          error: pollErrorMessage(error),
          already: error.hint === "already_voted",
          ...(refusal ? { refusal } : {}),
        };
      }
      const counts = pollCountsFromRows(data).get(pollId);
      return counts ? { counts } : { error: pollErrorMessage(null) };
    },
  };
}

/**
 * A poll post: the question and the poll saved together by
 * public.create_poll_post, so both land or neither does.
 */
export async function remoteCreatePollPost(
  supabase: RpcClient,
  body: string,
  draft: PollDraft,
): Promise<{ postId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_poll_post", {
    p_content: body.trim(),
    p_options: pollChoices(draft),
    p_duration_minutes: pollMinutes(draft.length),
  });
  if (error) return { error: pollsMissing(error) ? POLLS_UNAVAILABLE : pollErrorMessage(error) };
  if (typeof data !== "string" || !data) return { error: "Could not save that post." };
  return { postId: data };
}

/**
 * Writes "your poll ended" notices for the signed-in author and says how
 * many it wrote. Never throws: a failure is logged quietly and counts as 0.
 */
export async function settleEndedPolls(supabase: RpcClient): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("settle_ended_polls");
    if (error) {
      console.debug("[polls] settle_ended_polls:", error.message);
      return 0;
    }
    const settled = typeof data === "number" ? data : Number(data);
    return Number.isFinite(settled) && settled > 0 ? Math.floor(settled) : 0;
  } catch (error) {
    // Offline, or the function is missing: the next inbox load tries again.
    console.debug("[polls] settle_ended_polls:", error instanceof Error ? error.message : error);
    return 0;
  }
}

/** At most one settle per signed-in user in this long. */
export const SETTLE_EVERY_MS = 5 * 60_000;

const lastSettle = new Map<string, number>();

/**
 * The inbox load's settle: in the background, at most once every 5 minutes
 * per user. When it wrote any notice, listeners (the provider) are told so
 * the notifications list reads again once.
 */
export function settleEndedPollsInBackground(
  supabase: RpcClient,
  viewerId: string,
  now: number = Date.now(),
): Promise<number> {
  const last = lastSettle.get(viewerId);
  if (last !== undefined && now - last < SETTLE_EVERY_MS) return Promise.resolve(0);
  lastSettle.set(viewerId, now);
  return settleEndedPolls(supabase).then((settled) => {
    if (settled > 0) announcePollsSettled(viewerId);
    return settled;
  });
}

/** Tests only: forget when each user last settled. */
export function resetSettleThrottle() {
  lastSettle.clear();
}

/** The two refusals with their own wording, from the hint (or, for a suspension, the message). */
function pollRefusal(error: { hint?: string | null; message?: string | null } | null): VoteRefusal | null {
  if (error?.hint === "suspended") return "suspended";
  if (error?.hint === "poll_choice_text") return "poll_choice_text";
  if (/your account is suspended/i.test(error?.message ?? "")) return "suspended";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ResultRow = {
  poll_id?: unknown;
  total_votes?: unknown;
  options?: unknown;
  viewer_option_id?: unknown;
};

function count(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** Rows from poll_results / vote_in_poll, by poll id. */
export function pollCountsFromRows(rows: unknown): Map<string, PollCounts> {
  const out = new Map<string, PollCounts>();
  if (!Array.isArray(rows)) return out;
  for (const raw of rows as ResultRow[]) {
    if (!isRecord(raw) || typeof raw.poll_id !== "string") continue;
    const votes: Record<string, number> = {};
    if (Array.isArray(raw.options)) {
      for (const option of raw.options) {
        if (isRecord(option) && typeof option.id === "string") votes[option.id] = count(option.votes);
      }
    }
    out.set(raw.poll_id, {
      total: count(raw.total_votes),
      votes,
      viewerChoice: typeof raw.viewer_option_id === "string" ? raw.viewer_option_id : null,
    });
  }
  return out;
}

/** What a refused vote or poll says. The database puts a short code in the hint. */
export function pollErrorMessage(error: { hint?: string | null; message?: string | null; code?: string | null } | null): string {
  switch (pollRefusal(error)) {
    case "suspended":
      return VOTE_REFUSAL_COPY.suspended;
    case "poll_choice_text":
      return VOTE_REFUSAL_COPY.poll_choice_text;
    default:
      break;
  }
  switch (error?.hint) {
    case "own_poll":
      return "You can't vote in your own poll.";
    case "poll_ended":
      return "This poll has ended.";
    case "already_voted":
      return "You already voted in this poll.";
    case "poll_missing":
      return "That poll is unavailable.";
    case "signed_out":
      return "Sign in to vote.";
    case "poll_choices":
      return POLL_CHOICE_COUNT;
    case "poll_choice_length":
      return POLL_CHOICE_TOO_LONG;
    case "poll_choice_repeat":
      return POLL_CHOICE_REPEAT;
    case "poll_length":
      return POLL_LENGTH_ERROR;
    case "poll_question":
      return error.message?.includes("280") ? "Keep it to 280 characters." : POLL_QUESTION_REQUIRED;
    case "poll_locked":
      return "Polls can't be edited.";
    default:
      break;
  }
  if (error?.code === "23514" && error.message) return error.message;
  return POLL_VOTE_ERROR;
}
