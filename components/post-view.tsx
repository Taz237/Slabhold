"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ellipsis } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, LoadingRows } from "@/components/status";
import { solidButton } from "@/components/button-styles";
import { MentionText } from "@/components/mention-text";
import { MentionTextarea } from "@/components/mention-textarea";
import { SafetyMenu } from "@/components/safety-menu";
import { AuthorLine, Engagement, Tweet } from "@/components/tweet";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { canDeleteReply } from "@/lib/social/local-db";
import { quotesOf } from "@/lib/social/quotes";
import { COMMENT_LIMIT, type AuthResult, type PostComment } from "@/lib/social/types";

const PAGE_SIZE = 20;

export function PostView({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { ready, mode, user, posts, profiles, commentsFor, addComment, refresh, blockedIds, loadingPostId } =
    useSocial();
  const post = posts.find((item) => item.id === id);
  const loadingPost = mode === "supabase" && !post && loadingPostId === id;
  const author = post ? profiles.find((profile) => profile.id === post.authorId) : undefined;
  const replies = commentsFor(id);
  const authors = new Map(profiles.map((profile) => [profile.id, profile]));
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lane, setLane] = useState<"replies" | "quotes">("replies");
  const [quoteLimit, setQuoteLimit] = useState(PAGE_SIZE);
  const [deleteNotice, setDeleteNotice] = useState<{ text: string; error: boolean } | null>(null);

  const quotes = useMemo(() => quotesOf(posts, id), [id, posts]);
  const visibleQuotes = quotes.slice(0, quoteLimit);

  useEffect(() => {
    if (!ready || mode !== "local") return;
    void refresh();
  }, [ready, mode, id, refresh]);

  useEffect(() => {
    if (!ready || !user || window.location.hash !== "#reply") return;
    replyRef.current?.focus();
  }, [ready, user, id]);

  useEffect(() => {
    setLane("replies");
    setQuoteLimit(PAGE_SIZE);
  }, [id]);

  useEffect(() => {
    if (!deleteNotice) return;
    const timer = window.setTimeout(() => setDeleteNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [deleteNotice]);

  function onReplyDelete(result: AuthResult) {
    setDeleteNotice({
      text: result.error ?? "Reply deleted",
      error: Boolean(result.error),
    });
  }

  function focusReply(username?: string) {
    if (!user) {
      router.push(signupPath(pathname));
      return;
    }
    setLane("replies");
    if (username) {
      const mention = `@${username} `;
      setDraft((current) => (current.startsWith(mention) ? current : `${mention}${current}`));
    }
    requestAnimationFrame(() => replyRef.current?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!user) {
      router.push(signupPath(pathname));
      return;
    }
    setPending(true);
    const result = await addComment(id, draft);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    setError(result.notice ?? null);
    if (replyRef.current) {
      replyRef.current.style.height = "auto";
    }
  }

  function updateDraft(next: string) {
    setDraft(next);
    requestAnimationFrame(() => {
      const field = replyRef.current;
      if (!field) return;
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    });
  }

  if (!ready || (loadingPost && !post)) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows count={2} />
      </div>
    );
  }

  if (!post || !author) {
    return (
      <EmptyState title="That post is gone.">
        <Link href="/" className="text-sm font-bold">
          Back to Home
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="-mx-4 -mt-5 pb-[calc(14rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-2 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Post</h1>
      </div>

      <Tweet
        post={post}
        author={author}
        variant="detail"
        onReply={() => focusReply()}
        onQuotesClick={() => setLane("quotes")}
      />

      <div className="grid grid-cols-2 border-b border-zinc-200 text-[15px] dark:border-white/10">
        <LaneTab active={lane === "replies"} onClick={() => setLane("replies")}>
          Replies{replies.length > 0 ? ` · ${replies.length}` : ""}
        </LaneTab>
        <LaneTab active={lane === "quotes"} onClick={() => setLane("quotes")}>
          {quotes.length} Quote{quotes.length === 1 ? "" : "s"}
        </LaneTab>
      </div>

      {lane === "quotes" ? (
        visibleQuotes.length === 0 ? (
          <EmptyState title="No quotes yet" detail="Quote this post to share your take." />
        ) : (
          <div>
            {visibleQuotes.map((quote) => {
              const quoteAuthor = authors.get(quote.authorId);
              if (!quoteAuthor) return null;
              return <Tweet key={quote.id} post={quote} author={quoteAuthor} />;
            })}
            {quotes.length > visibleQuotes.length ? (
              <button
                type="button"
                onClick={() => setQuoteLimit((n) => n + PAGE_SIZE)}
                className="w-full py-3 text-sm font-semibold text-sky-600 dark:text-sky-400"
              >
                Show more
              </button>
            ) : null}
          </div>
        )
      ) : replies.length === 0 ? (
        <EmptyState title="No replies yet" detail="Start the conversation." />
      ) : (
        <ul>
          {replies.map((reply) => {
            const commenter = authors.get(reply.authorId);
            const name = commenter?.displayName ?? "Collector";
            const username = commenter?.username ?? "user";
            return (
              <li
                key={reply.id}
                className="flex gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10"
              >
                <Link href={commenter ? `/u/${commenter.username}` : "/"} className="shrink-0">
                  <Avatar
                    name={name}
                    image={commenter?.avatarDataUrl}
                    accent={commenter?.accent}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <AuthorLine
                      name={name}
                      username={username}
                      href={commenter ? `/u/${commenter.username}` : "/"}
                      createdAt={reply.createdAt}
                    />
                    {canDeleteReply(user?.id, reply.authorId) ? (
                      <ReplyMenu reply={reply} onResult={onReplyDelete} />
                    ) : (
                      <SafetyMenu
                        targetType="reply"
                        targetId={reply.id}
                        reportedUserId={reply.authorId}
                        username={username}
                      />
                    )}
                  </div>
                  <p className="text-[13px] text-zinc-500">
                    Replying to{" "}
                    <Link
                      href={`/u/${author.username}`}
                      className="text-sky-600 hover:underline dark:text-sky-400"
                    >
                      @{author.username}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-[15px] leading-5 break-words whitespace-pre-wrap">
                    <MentionText text={reply.body} />
                  </p>
                  <Engagement
                    targetId={reply.id}
                    onReply={() => focusReply(commenter?.username)}
                    quoteAvailable={false}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user && lane === "replies" && author.id !== user.id && blockedIds.includes(author.id) ? (
        <div className="fixed inset-x-0 bottom-[calc(6.15rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-lg border-t border-zinc-200 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-4 py-3 text-sm text-zinc-500 backdrop-blur-xl dark:border-white/10">
          You can&apos;t interact with this account.
        </div>
      ) : user && lane === "replies" ? (
        <form
          onSubmit={submit}
          className="fixed inset-x-0 bottom-[calc(6.15rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-lg border-t border-zinc-200 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-3 py-2 backdrop-blur-xl dark:border-white/10"
        >
          <div className="flex items-end gap-2">
            <Avatar
              name={user.displayName}
              image={user.avatarDataUrl}
              accent={user.accent}
              className="mb-1 h-8 w-8"
            />
            <MentionTextarea
              ref={replyRef}
              id="reply"
              value={draft}
              onChange={updateDraft}
              maxLength={COMMENT_LIMIT}
              rows={1}
              menu="docked"
              placeholder="Post your reply"
              className="max-h-32 min-h-9 w-full resize-none bg-transparent py-2 text-[15px] leading-5 outline-none placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className={`${solidButton} mb-1`}
            >
              Reply
            </button>
          </div>
          {error ? <p className="mt-1 pl-10 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        </form>
      ) : !user && lane === "replies" ? (
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-white/10">
          <p className="text-sm text-zinc-500">Sign up to reply</p>
          <Link href={signupPath(pathname)} className={solidButton}>
            Sign up
          </Link>
        </div>
      ) : null}
      {deleteNotice ? (
        <p
          role="status"
          className={`fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm font-bold shadow-lg ${
            deleteNotice.error
              ? "bg-rose-600 text-white"
              : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
          }`}
        >
          {deleteNotice.text}
        </p>
      ) : null}
    </div>
  );
}

function ReplyMenu({
  reply,
  onResult,
}: {
  reply: PostComment;
  onResult: (result: AuthResult) => void;
}) {
  const { deleteComment } = useSocial();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  return (
    <div ref={rootRef} className="relative -mt-1 shrink-0">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setConfirming(false);
          setOpen((value) => !value);
        }}
        className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
      >
        <Ellipsis className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-9 right-0 z-30 w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          {confirming ? (
            <div className="px-3 py-2.5">
              <p className="text-sm font-bold">Delete this reply?</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (started.current) return;
                    started.current = true;
                    void deleteComment(reply.id).then((result) => {
                      if (result.error) started.current = false;
                      close();
                      onResult(result);
                    });
                  }}
                  className="flex-1 rounded-full bg-rose-600 py-1.5 text-sm font-bold text-white"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-full border border-zinc-300 py-1.5 text-sm font-bold dark:border-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="block w-full px-4 py-2.5 text-left text-[15px] font-bold text-rose-600 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              Delete reply
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LaneTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-3 font-medium ${
        active ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-500"
      }`}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-8 bottom-0 h-1 rounded-full bg-violet-600" />
      ) : null}
    </button>
  );
}
