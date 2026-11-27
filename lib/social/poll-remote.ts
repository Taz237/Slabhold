import type { SupabaseClient } from "@supabase/supabase-js";
import type { PollBackend } from "./poll-store";
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
      if (error) return { error: pollErrorMessage(error), already: error.hint === "already_voted" };
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

/** Writes "your poll ended" notices for the signed-in author. Never throws. */
export async function settleEndedPolls(supabase: RpcClient): Promise<void> {
  try {
    await supabase.rpc("settle_ended_polls");
  } catch {
    // Missing function or offline: the next inbox load tries again.
  }
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
