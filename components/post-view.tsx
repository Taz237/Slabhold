"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, LoadingRows } from "@/components/status";
import { solidButton } from "@/components/button-styles";
import { MentionText } from "@/components/mention-text";
import { MentionTextarea } from "@/components/mention-textarea";
import { SafetyMenu } from "@/components/safety-menu";
import { AuthorLine, Engagement, Tweet } from "@/components/tweet";
import { useSocial } from "@/components/social-provider";
import { quotesOf } from "@/lib/social/quotes";
import { COMMENT_LIMIT } from "@/lib/social/types";

const PAGE_SIZE = 20;

export function PostView({ id }: { id: string }) {
  const router = useRouter();
  const { ready, user, posts, profiles, commentsFor, addComment, refresh, blockedIds } = useSocial();
  const post = posts.find((item) => item.id === id);
  const author = post ? profiles.find((profile) => profile.id === post.authorId) : undefined;
  const replies = commentsFor(id);
  const authors = new Map(profiles.map((profile) => [profile.id, profile]));
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lane, setLane] = useState<"replies" | "quotes">("replies");
  const [quoteLimit, setQuoteLimit] = useState(PAGE_SIZE);

  const quotes = useMemo(() => quotesOf(posts, id), [id, posts]);
  const visibleQuotes = quotes.slice(0, quoteLimit);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, id, refresh]);

  useEffect(() => {
    if (!ready || !user || window.location.hash !== "#reply") return;
    replyRef.current?.focus();
  }, [ready, user, id]);

  useEffect(() => {
    setLane("replies");
    setQuoteLimit(PAGE_SIZE);
  }, [id]);

  function focusReply(username?: string) {
    if (!user) return;
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
      router.push("/login");
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

  if (!ready) {
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
          Back to Timeline
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="-mx-4 -mt-5 pb-24">
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
                    <SafetyMenu
                      targetType="reply"
                      targetId={reply.id}
                      reportedUserId={reply.authorId}
                      username={username}
                    />
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

      {user && lane === "replies" && blockedIds.includes(author.id) ? (
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
        <div className="fixed inset-x-0 bottom-[calc(6.15rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-full max-w-lg items-center justify-between gap-3 border-t border-zinc-200 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-xl dark:border-white/10">
          <p className="text-sm text-zinc-500">Log in to reply</p>
          <Link href="/login" className={solidButton}>
            Log in
          </Link>
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
