import { sanitizeGif, type PostGif } from "./gifs";

/** The columns added for GIF posts and threads. */
export const POST_EXTRA_COLUMNS = "gif, thread_id, thread_position";

type ExtraRow = { gif?: unknown; thread_id?: unknown; thread_position?: unknown };

/** GIF and thread fields of a posts row, as they sit on a Post. */
export function postExtrasFromRow(row: ExtraRow): {
  gif: PostGif | null;
  threadId: string | null;
  threadPosition: number | null;
} {
  const threadId = typeof row.thread_id === "string" && row.thread_id ? row.thread_id : null;
  const position =
    typeof row.thread_position === "number" && Number.isInteger(row.thread_position) && row.thread_position >= 0
      ? row.thread_position
      : null;
  const threaded = threadId !== null && position !== null;
  return {
    gif: sanitizeGif(row.gif),
    threadId: threaded ? threadId : null,
    threadPosition: threaded ? position : null,
  };
}

/** The GIF on a comments row, when it has one we will render. */
export function replyGifFromRow(row: { gif?: unknown }): { gif: PostGif } | Record<string, never> {
  const gif = sanitizeGif(row.gif);
  return gif ? { gif } : {};
}
