import { sanitizeGif, type PostGif } from "./gifs";
import { sanitizeVideo, type PostVideo } from "./videos";
import { pollFromMeta, type PostPoll } from "./poll-meta";

/** The columns added for GIF posts and threads. */
export const POST_EXTRA_COLUMNS = "gif, thread_id, thread_position";

type ExtraRow = { gif?: unknown; video?: unknown; thread_id?: unknown; thread_position?: unknown; meta?: unknown };

/** The video column, read alongside the others once the database has it. */
export const POST_VIDEO_COLUMN = "video";

/** GIF, video, thread and poll fields of a posts row, as they sit on a Post. */
export function postExtrasFromRow(row: ExtraRow): {
  gif: PostGif | null;
  /** Left off when the row has no video, so older rows map as before. */
  video?: PostVideo;
  threadId: string | null;
  threadPosition: number | null;
  /** Left off when the row has no poll (meta.poll). */
  poll?: PostPoll;
} {
  const threadId = typeof row.thread_id === "string" && row.thread_id ? row.thread_id : null;
  const position =
    typeof row.thread_position === "number" && Number.isInteger(row.thread_position) && row.thread_position >= 0
      ? row.thread_position
      : null;
  const threaded = threadId !== null && position !== null;
  const video = sanitizeVideo(row.video);
  const poll = pollFromMeta(row.meta);
  return {
    gif: sanitizeGif(row.gif),
    ...(video ? { video } : {}),
    ...(poll ? { poll } : {}),
    threadId: threaded ? threadId : null,
    threadPosition: threaded ? position : null,
  };
}

/** The GIF on a comments row, when it has one we will render. */
export function replyGifFromRow(row: { gif?: unknown }): { gif: PostGif } | Record<string, never> {
  const gif = sanitizeGif(row.gif);
  return gif ? { gif } : {};
}

/** The video on a comments row, when it has one we will render. */
export function replyVideoFromRow(row: { video?: unknown }): { video: PostVideo } | Record<string, never> {
  const video = sanitizeVideo(row.video);
  return video ? { video } : {};
}
