"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import { loginPath, signupPath } from "@/lib/auth/safe-next";
import { initials } from "@/lib/format";
import { userHref } from "@/lib/social/user-href";
import { CATALOG_PATH } from "@/lib/public-catalog/query";
import { feedCount, type FeedCard } from "@/lib/catalog-feed/feed";
import { cardSocialClient, type ListedCardComment } from "@/lib/catalog-feed/card-client";
import {
  canDeleteCardComment,
  CARD_COMMENT_MAX,
  cardSocialError,
  cleanCommentBody,
  commentCharsLeft,
} from "@/lib/catalog-feed/card-social";

type SheetComment = ListedCardComment;

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-violet-500";

/** "now", "5m", "3h", "2d", or "Oct 4". */
export function commentAge(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Focus moves in, Escape closes, and focus goes back to what opened it. */
function useSheetFocus(onClose: () => void) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return first;
}

function Sheet({
  titleId,
  label,
  onClose,
  children,
}: {
  titleId: string;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={label}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-safe:animate-[lightbox-fade_160ms_ease-out_both]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[72dvh] max-w-lg flex-col rounded-t-3xl bg-[var(--background)] pb-[env(safe-area-inset-bottom)] text-[var(--foreground)] shadow-[0_-12px_40px_rgb(0_0_0/0.25)] motion-safe:animate-[feed-sheet-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-white/20" />
        {children}
      </div>
    </div>
  );
}

/**
 * Comments on a card (public.card_comments), newest first, in a sheet over
 * the feed. Reads run under the viewer's own access, so blocks apply.
 * Writes and deletes go through the server actions, which check limits.
 */
export function CommentsSheet({
  card,
  onClose,
  onCountChange,
}: {
  card: FeedCard;
  onClose: () => void;
  onCountChange: (cardId: string, delta: number) => void;
}) {
  const titleId = useId();
  const { user } = useSocial();
  const viewerId = user?.id ?? null;
  const [comments, setComments] = useState<SheetComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useSheetFocus(onClose);

  useEffect(() => {
    let cancelled = false;
    void cardSocialClient
      .list(card.id)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!user || sending) return;
    const clean = cleanCommentBody(draft);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await cardSocialClient.post({ cardId: card.id, body: clean.body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      setComments((list) => [
        {
          id: result.comment.id,
          userId: result.comment.userId,
          body: result.comment.body,
          createdAt: result.comment.createdAt,
          author: { username: user.username, displayName: user.displayName, avatarUrl: user.avatarDataUrl },
        },
        ...(list ?? []),
      ]);
      onCountChange(card.id, 1);
    } catch (thrown) {
      setError(cardSocialError(thrown as { code?: string; message?: string }, "Couldn't post that comment."));
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: SheetComment) {
    if (deleting) return;
    setDeleting(comment.id);
    setError(null);
    const before = comments;
    setComments((list) => (list ?? []).filter((item) => item.id !== comment.id));
    try {
      const result = await cardSocialClient.remove({ commentId: comment.id });
      if (!result.ok) {
        setComments(before);
        setError(result.error);
        return;
      }
      onCountChange(card.id, -1);
    } catch {
      setComments(before);
      setError("Couldn't delete that comment.");
    } finally {
      setDeleting(null);
    }
  }

  const count = comments ? Math.max(comments.length, card.commentCount) : card.commentCount;
  const left = commentCharsLeft(draft);

  return (
    <Sheet titleId={titleId} label="Close comments" onClose={onClose}>
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center px-2 pt-1">
        <span aria-hidden />
        <h2 id={titleId} className="text-center text-[15px] font-semibold">
          {count > 0 ? `${feedCount(count)} ${count === 1 ? "comment" : "comments"}` : "Comments"}
        </h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-900/[0.05] dark:hover:bg-white/10 ${FOCUS}`}
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-40 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
        {failed ? (
          <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">Couldn&apos;t load comments.</p>
        ) : comments == null ? (
          <ul aria-busy="true" aria-label="Loading comments" className="space-y-4 py-3">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex gap-3">
                <span className="skeleton-shimmer h-9 w-9 shrink-0 rounded-full" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="skeleton-shimmer block h-3 w-24 rounded" />
                  <span className="skeleton-shimmer block h-3 w-4/5 rounded" />
                </span>
              </li>
            ))}
          </ul>
        ) : comments.length === 0 ? (
          <div data-comments-empty="" className="py-10 text-center">
            <p className="text-[15px] font-semibold">No comments yet</p>
            <p className="mx-auto mt-1 max-w-64 text-sm text-zinc-600 dark:text-zinc-400">Say what you think of this card.</p>
          </div>
        ) : (
          <ul data-comments="" className="space-y-4 py-3">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Face author={comment.author} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center text-[13px] leading-5">
                    {comment.author ? (
                      <Link href={userHref(comment.author.username)} className={`font-semibold ${FOCUS}`}>
                        @{comment.author.username}
                      </Link>
                    ) : (
                      <span className="font-semibold">Collector</span>
                    )}
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">{commentAge(comment.createdAt)}</span>
                  </p>
                  <p className="text-[15px] leading-6 break-words whitespace-pre-wrap">{comment.body}</p>
                </div>
                {canDeleteCardComment({ viewerId, commentUserId: comment.userId, cardOwnerId: card.owner.id }) ? (
                  <button
                    type="button"
                    onClick={() => void remove(comment)}
                    disabled={deleting === comment.id}
                    aria-label={`Delete comment by @${comment.author?.username ?? "collector"}`}
                    className={`-mr-2 min-h-11 shrink-0 self-start rounded-full px-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100 ${FOCUS}`}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {user ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-zinc-200 px-3 py-2 dark:border-white/10">
          <label className="sr-only" htmlFor={`${titleId}-draft`}>
            Add a comment
          </label>
          <div className="relative flex-1">
            <textarea
              id={`${titleId}-draft`}
              value={draft}
              maxLength={CARD_COMMENT_MAX + 20}
              rows={1}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Add a comment"
              className="block max-h-28 min-h-11 w-full resize-none rounded-2xl bg-zinc-900/[0.05] py-2.5 pr-12 pl-4 text-base outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-white/[0.07]"
            />
            {left <= 40 ? (
              <span
                aria-live="polite"
                className={`absolute right-3 bottom-3 font-mono text-[11px] tabular-nums ${
                  left < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {left}
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || left < 0 || sending}
            className={`min-h-11 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`}
          >
            {sending ? "Posting" : "Post"}
          </button>
        </form>
      ) : null}
    </Sheet>
  );
}

export type SignInReason = "like" | "comment" | "save" | "follow";

const SIGN_IN_TITLE: Record<SignInReason, string> = {
  like: "Log in to like cards",
  comment: "Log in to comment",
  save: "Log in to save cards",
  follow: "Log in to follow collectors",
};

/** What a signed-out tap on the rail gets: a short prompt, never a jump away from the feed. */
export function SignInPrompt({ reason, onClose }: { reason: SignInReason; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useSheetFocus(onClose);
  return (
    <Sheet titleId={titleId} label="Close" onClose={onClose}>
      <div data-sign-in-prompt="" className="relative px-6 pt-4 pb-6 text-center">
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`absolute top-0 right-2 grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-900/[0.05] dark:hover:bg-white/10 ${FOCUS}`}
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
        <h2 id={titleId} className="text-lg leading-7 font-semibold">
          {SIGN_IN_TITLE[reason]}
        </h2>
        <p className="mx-auto mt-1 max-w-72 text-sm text-zinc-600 dark:text-zinc-400">
          Heart cards, talk about them and keep your wants in one place.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={signupPath(CATALOG_PATH)}
            className={`inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white ${FOCUS}`}
          >
            Create account
          </Link>
          <Link
            href={loginPath(CATALOG_PATH)}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-300 dark:text-zinc-100 dark:ring-white/20 ${FOCUS}`}
          >
            Log in
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

function Face({ author }: { author: SheetComment["author"] }) {
  const [broken, setBroken] = useState(false);
  if (author?.avatarUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={author.avatarUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-700 dark:text-[#A78BFA]">
      {initials(author?.displayName ?? "C")}
    </span>
  );
}
