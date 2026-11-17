"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { initials } from "@/lib/format";
import { userHref } from "@/lib/social/user-href";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { CATALOG_PATH } from "@/lib/public-catalog/query";
import { feedCount, type FeedCard } from "@/lib/catalog-feed/feed";

/** Newest comments the sheet reads. The card page has the rest. */
export const SHEET_COMMENT_LIMIT = 50;
export const COMMENT_MAX = 280;

type SheetComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { username: string; displayName: string; avatarUrl: string | null } | null;
};

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

/**
 * Comments for a card, in a sheet over the feed. They are the comments on
 * the card's newest post, read under the viewer's own access (so blocks
 * apply). A card that was never posted has none yet.
 */
export function CommentsSheet({
  card,
  onClose,
  onPosted,
}: {
  card: FeedCard;
  onClose: () => void;
  onPosted: (cardId: string) => void;
}) {
  const titleId = useId();
  const { user, addComment } = useSocial();
  const [comments, setComments] = useState<SheetComment[] | null>(card.postId ? null : []);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  // Focus moves in, Escape closes, and focus goes back to the comment button.
  useEffect(() => {
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    const postId = card.postId;
    if (!postId) return;
    let cancelled = false;
    void loadSupabaseBrowser()
      .then(async (supabase) => {
        if (!supabase) throw new Error("offline");
        const { data, error: readError } = await supabase
          .from("comments")
          .select("id, body, created_at, user_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .limit(SHEET_COMMENT_LIMIT);
        if (readError) throw readError;
        const rows = (data ?? []) as { id: string; body: string; created_at: string; user_id: string }[];
        const ids = [...new Set(rows.map((row) => row.user_id))];
        const { data: people } = ids.length
          ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
          : { data: [] };
        const byId = new Map(
          ((people ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null }[]).map(
            (row) => [row.id, { username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url }],
          ),
        );
        if (cancelled) return;
        setComments(
          rows.map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, author: byId.get(row.user_id) ?? null })),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [card.postId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !card.postId || !user || sending) return;
    setSending(true);
    setError(null);
    const result = await addComment(card.postId, text);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    setComments((list) => [
      {
        id: `local-${Date.now()}`,
        body: text,
        createdAt: new Date().toISOString(),
        author: { username: user.username, displayName: user.displayName, avatarUrl: user.avatarDataUrl },
      },
      ...(list ?? []),
    ]);
    onPosted(card.id);
  }

  const count = comments ? Math.max(comments.length, card.commentCount) : card.commentCount;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close comments"
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
            <div className="py-10 text-center">
              <p className="text-[15px] font-semibold">No comments yet</p>
              <p className="mx-auto mt-1 max-w-64 text-sm text-zinc-600 dark:text-zinc-400">
                {card.postId
                  ? "Say what you think of this card."
                  : `Comments open once @${card.owner.username} posts this card.`}
              </p>
            </div>
          ) : (
            <ul className="space-y-4 py-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <Face author={comment.author} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-5">
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
                </li>
              ))}
            </ul>
          )}
        </div>
        {card.postId ? (
          user ? (
            <form onSubmit={send} className="flex items-end gap-2 border-t border-zinc-200 px-3 py-2 dark:border-white/10">
              <label className="sr-only" htmlFor={`${titleId}-draft`}>
                Add a comment
              </label>
              <textarea
                id={`${titleId}-draft`}
                value={draft}
                maxLength={COMMENT_MAX}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Add a comment"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-zinc-900/[0.05] px-4 py-2.5 text-base outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-white/[0.07]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className={`min-h-11 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`}
              >
                {sending ? "Posting" : "Post"}
              </button>
            </form>
          ) : (
            <div className="border-t border-zinc-200 px-4 py-3 text-center dark:border-white/10">
              <Link href={signupPath(CATALOG_PATH)} className={`inline-flex min-h-11 items-center text-sm font-semibold text-violet-700 dark:text-[#A78BFA] ${FOCUS}`}>
                Log in to comment
              </Link>
            </div>
          )
        ) : null}
        {error ? (
          <p role="alert" className="px-4 pb-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
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
