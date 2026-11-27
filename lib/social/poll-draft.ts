/** Writing a poll in the composer, and the words for what the server refuses. */

export { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from "./poll-meta";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from "./poll-meta";

export const POLL_OPTION_MAX = 25;
export const POLL_MIN_MINUTES = 5;
export const POLL_MAX_DAYS = 7;
export const POLL_MAX_MINUTES = POLL_MAX_DAYS * 24 * 60;

/** What the composer holds while a poll is being written. */
export type PollLength = { days: number; hours: number; minutes: number };

export type PollDraft = {
  options: string[];
  length: PollLength;
};

export const DEFAULT_POLL_LENGTH: PollLength = { days: 1, hours: 0, minutes: 0 };

export function emptyPollDraft(): PollDraft {
  return { options: ["", ""], length: { ...DEFAULT_POLL_LENGTH } };
}

export const POLL_CHOICE_REQUIRED = "Fill in every choice.";
export const POLL_CHOICE_TOO_LONG = `Choices can be up to ${POLL_OPTION_MAX} characters.`;
export const POLL_CHOICE_REPEAT = "Each choice needs to be different.";
export const POLL_CHOICE_COUNT = `A poll has ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} choices.`;
export const POLL_LENGTH_ERROR = "A poll runs from 5 minutes to 7 days.";
export const POLL_QUESTION_REQUIRED = "Ask a question for your poll.";
export const POLLS_UNAVAILABLE = "Polls aren't available yet. Remove the poll to post.";
export const POLL_VOTE_ERROR = "Couldn't save your vote. Try again.";

/** Trimmed choices, in order. */
export function pollChoices(draft: Pick<PollDraft, "options">): string[] {
  return draft.options.map((option) => option.trim());
}

/** The first thing wrong with a draft poll, or null when it can be posted. */
export function pollDraftProblem(draft: PollDraft): string | null {
  const choices = pollChoices(draft);
  if (choices.length < POLL_MIN_OPTIONS || choices.length > POLL_MAX_OPTIONS) return POLL_CHOICE_COUNT;
  if (choices.some((choice) => choice.length === 0)) return POLL_CHOICE_REQUIRED;
  if (choices.some((choice) => [...choice].length > POLL_OPTION_MAX)) return POLL_CHOICE_TOO_LONG;
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) return POLL_CHOICE_REPEAT;
  const minutes = pollMinutes(draft.length);
  if (minutes < POLL_MIN_MINUTES || minutes > POLL_MAX_MINUTES) return POLL_LENGTH_ERROR;
  return null;
}

export function pollMinutes(length: PollLength): number {
  return length.days * 24 * 60 + length.hours * 60 + length.minutes;
}
