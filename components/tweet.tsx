"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ellipsis, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useSocial } from "@/components/social-provider";
import { exactTime, initials, money, timeAgo } from "@/lib/format";
import type { Post, Profile, PublicCard } from "@/lib/social/types";

export function Tweet({
  post,
  author,
  variant = "feed",
  onReply,
  repostedBy = null,
}: {
  post: Post;
  author: Profile;
  variant?: "feed" | "detail";
  onReply?: () => void;
  repostedBy?: Profile | null;
}) {
  const router = useRouter();
  const { commentsFor } = useSocial();
  const comments = commentsFor(post.id);

  function openPost(event: React.MouseEvent<HTMLElement>) {
    if (variant !== "feed") return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button")) return;
    router.push(`/posts/${post.id}`);
  }

  function openReplies() {
    if (onReply) {
      onReply();
      return;
    }
    router.push(`/posts/${post.id}#reply`);
  }

  const bodyClass =
    variant === "detail" ? "mt-1 text-[17px] leading-6" : "mt-0.5 text-[15px] leading-5";

  return (
    <article
      onClick={openPost}
      className={`border-b border-zinc-200 dark:border-white/10 ${variant === "feed" ? "cursor-pointer" : ""}`}
    >
      {repostedBy ? (
        <Link
          href={`/u/${repostedBy.username}`}
          className="flex items-center gap-3 px-4 pt-3 text-[13px] font-bold text-zinc-500"
        >
          <span className="grid w-10 shrink-0 place-items-center">
            <Repeat2 className="h-4 w-4" />
          </span>
          <span className="truncate hover:underline">{repostedBy.displayName} reposted</span>
        </Link>
      ) : null}
      <div className={`flex gap-3 px-4 ${repostedBy ? "pt-1 pb-3" : "py-3"}`}>
      <Link href={`/u/${author.username}`} className="shrink-0">
        <Avatar name={author.displayName} image={author.avatarDataUrl} accent={author.accent} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <AuthorLine
            name={author.displayName}
            username={author.username}
            href={`/u/${author.username}`}
            createdAt={post.createdAt}
          />
          <PostMenu post={post} />
        </div>
        {post.body ? <p className={`whitespace-pre-wrap ${bodyClass}`}>{post.body}</p> : null}
        {post.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageDataUrl}
            alt=""
            className="mt-3 max-h-80 w-full rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
          />
        ) : null}
        {post.card ? <CardMedia card={post.card} /> : null}
        <Engagement targetId={post.id} replyCount={comments.length} onReply={openReplies} />
      </div>
      </div>
    </article>
  );
}

export function AuthorLine({
  name,
  username,
  href,
  createdAt,
}: {
  name: string;
  username: string;
  href: string;
  createdAt: string;
}) {
  const relative = timeAgo(createdAt);
  const exact = exactTime(createdAt);

  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-x-1 text-[15px]">
      <Link href={href} className="max-w-[46%] truncate font-bold hover:underline">
        {name}
      </Link>
      <span className="min-w-0 truncate text-zinc-500">@{username}</span>
      {relative ? (
        <time
          dateTime={createdAt}
          title={exact || undefined}
          className="shrink-0 whitespace-nowrap text-zinc-500"
        >
          · {relative}
        </time>
      ) : null}
    </div>
  );
}

function PostMenu({ post }: { post: Post }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, deletePost } = useSocial();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mine = Boolean(user && user.id === post.authorId);

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
          if (!mine) return;
          setConfirming(false);
          setOpen((value) => !value);
        }}
        className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
      >
        <Ellipsis className="h-5 w-5" />
      </button>
      {open && mine ? (
        <div
          role="menu"
          className="absolute top-9 right-0 z-30 w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          {confirming ? (
            <div className="px-3 py-2.5">
              <p className="text-sm font-bold">Delete this post?</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void deletePost(post.id).then((result) => {
                      close();
                      if (!result.error && pathname === `/posts/${post.id}`) router.replace("/");
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
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => router.push(`/compose?edit=${post.id}`)}
                className="block w-full px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                Edit post
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirming(true)}
                className="block w-full px-4 py-2.5 text-left text-[15px] font-bold text-rose-600 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                Delete post
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Engagement({
  targetId,
  replyCount = 0,
  onReply,
}: {
  targetId: string;
  replyCount?: number;
  onReply: () => void;
}) {
  const router = useRouter();
  const { user, toggleLike, toggleRepost, isLiked, isReposted, likeCount, repostCount } = useSocial();
  const liked = isLiked(targetId);
  const reposted = isReposted(targetId);

  function requireUser() {
    if (user) return true;
    router.push("/login");
    return false;
  }

  return (
    <div className="mt-1.5 -ml-2 flex items-center text-zinc-500">
      <ActionButton label="Reply" count={replyCount} active={false} tone="sky" onClick={onReply}>
        <MessageCircle className="h-[18px] w-[18px]" />
      </ActionButton>
      <ActionButton
        label={reposted ? "Undo repost" : "Repost"}
        count={repostCount(targetId)}
        active={reposted}
        pressed={reposted}
        tone="emerald"
        onClick={() => {
          if (requireUser()) toggleRepost(targetId);
        }}
      >
        <Repeat2 className="h-[18px] w-[18px]" />
      </ActionButton>
      <ActionButton
        label={liked ? "Unlike" : "Like"}
        count={likeCount(targetId)}
        active={liked}
        pressed={liked}
        tone="rose"
        onClick={() => {
          if (requireUser()) toggleLike(targetId);
        }}
      >
        <Heart className={`h-[18px] w-[18px] ${liked ? "fill-current" : ""}`} />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  label,
  count,
  active,
  pressed,
  tone,
  onClick,
  children,
}: {
  label: string;
  count: number;
  active: boolean;
  pressed?: boolean;
  tone: "sky" | "emerald" | "rose";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color =
    tone === "sky"
      ? "hover:text-sky-500"
      : tone === "emerald"
        ? "hover:text-emerald-500"
        : "hover:text-rose-500";
  const on =
    tone === "sky" ? "text-sky-500" : tone === "emerald" ? "text-emerald-500" : "text-rose-500";
  const wash =
    tone === "sky"
      ? "group-hover:bg-sky-500/10"
      : tone === "emerald"
        ? "group-hover:bg-emerald-500/10"
        : "group-hover:bg-rose-500/10";

  return (
    <button
      type="button"
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`group inline-flex min-h-9 flex-1 items-center ${active ? on : color}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${wash}`}>{children}</span>
      {count > 0 ? <span className="text-[13px] tabular-nums">{count}</span> : null}
    </button>
  );
}

function CardMedia({ card }: { card: PublicCard }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      {card.photoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photoDataUrl} alt="" className="max-h-80 w-full object-cover" />
      ) : (
        <div
          className="grid h-36 place-items-center text-lg font-semibold text-white"
          style={{ background: `linear-gradient(160deg, ${card.accent}, #18181b)` }}
        >
          {initials(card.playerName)}
        </div>
      )}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold">{card.playerName}</p>
        <p className="truncate text-xs text-zinc-500">
          {card.year} {card.setBrand}
          {card.cardNumber ? ` · #${card.cardNumber}` : ""} · Est. {money(card.estimatedSellPrice)}
        </p>
      </div>
    </div>
  );
}
