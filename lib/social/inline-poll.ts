import { composeDraftKey, keepComposeDraft } from "./compose-draft";

/** Where the home feed's poll button goes: the full composer, poll editor open. */
export const POLL_COMPOSE_HREF = "/compose?poll=1";

/**
 * The home feed's "Add a poll" button, by the same rules as /compose:
 * hidden until the database has polls, while quoting, or on a thread of
 * more than one post; resting while a photo, GIF, video or card is on.
 */
export function inlinePollButton(state: {
  pollsOn: boolean;
  quoting: boolean;
  posts: number;
  photos: number;
  gif: boolean;
  video: boolean;
  card: boolean;
}): "hidden" | "disabled" | "on" {
  if (!state.pollsOn || state.quoting || state.posts > 1) return "hidden";
  if (state.photos > 0 || state.gif || state.video || state.card) return "disabled";
  return "on";
}

/**
 * Hand what's typed to /compose and open the poll editor there. Uses the
 * same in-memory draft handoff as the plus button, so the text arrives as is.
 */
export function startPollInComposer(body: string, push: (href: string) => void) {
  const key = composeDraftKey({ edit: null, quote: null, card: null });
  if (key) keepComposeDraft(key, { body, images: [], cardId: "", quoteId: null, gif: null });
  push(POLL_COMPOSE_HREF);
}
