import { isReplyMentionMetadata } from "./reply-mentions";
import { replyNoticePreview } from "./reply-images";
import type { Notification, PostComment, PostLike, PostRepost } from "./types";

/**
 * Deleting a reply: who may, and what goes with it. Shared by hosted and
 * on-device accounts, and kept apart from local-db so hosted screens don't load it.
 */

export function canDeleteReply(viewerId: string | null | undefined, authorId: string) {
  return Boolean(viewerId && viewerId === authorId);
}

/**
 * True when this row is the deleter's comment notice, or a reply mention they
 * sent, on the parent post, and the stored preview is this reply's preview.
 * Notifications have no comment id, so the preview is the match.
 */
function isOwnReplyPreviewNotification(note: Notification, comment: PostComment) {
  if (note.actorId !== comment.authorId) return false;
  if (note.postId !== comment.postId) return false;
  if (comment.body.trim().length === 0) return false;
  const preview = replyNoticePreview(comment.body, comment.images);
  if (!preview || note.preview !== preview) return false;
  if (note.kind === "comment") return true;
  return note.kind === "mention" && isReplyMentionMetadata(note.metadata);
}

/** Photo-only notices are preview NULL on the server and "Photo" locally. Keep the newest one. */
function newestPhotoOnlyNoticeId(notes: readonly Notification[], comment: PostComment): string | null {
  let best: Notification | null = null;
  for (const note of notes) {
    if (note.actorId !== comment.authorId || note.postId !== comment.postId) continue;
    if (note.kind !== "comment") continue;
    if (note.preview !== null && note.preview !== "Photo") continue;
    if (!best || note.createdAt > best.createdAt || (note.createdAt === best.createdAt && note.id > best.id)) {
      best = note;
    }
  }
  return best?.id ?? null;
}

/** Drops the reply and rows tied to it. An error keeps the previous rows. */
export function stateAfterReplyDelete(
  before: {
    comments: PostComment[];
    likes: PostLike[];
    reposts: PostRepost[];
    notifications: Notification[];
  },
  commentId: string,
  result: { error?: string },
) {
  if (result.error) return before;
  const comment = before.comments.find((item) => item.id === commentId);
  return {
    comments: before.comments.filter((item) => item.id !== commentId),
    likes: before.likes.filter((like) => like.postId !== commentId),
    reposts: before.reposts.filter((repost) => repost.postId !== commentId),
    notifications: before.notifications.filter((note) => {
      if (note.postId === commentId) return false;
      if (!comment) return true;
      if (comment.body.trim().length === 0 && (comment.images?.length ?? 0) > 0) {
        return note.id !== newestPhotoOnlyNoticeId(before.notifications, comment);
      }
      if (isOwnReplyPreviewNotification(note, comment)) return false;
      return true;
    }),
  };
}
