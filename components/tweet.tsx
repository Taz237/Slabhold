"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ellipsis, Heart, MessageCircle, Quote, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCollection } from "@/components/collection-provider";
import { useImageLightbox } from "@/components/image-lightbox";
import { PostPhotoGrid } from "@/components/post-photo-grid";
import { MentionText } from "@/components/mention-text";
import { QuotedPostEmbed } from "@/components/quoted-post-embed";
import { SafetyMenu } from "@/components/safety-menu";
import { ShareAction } from "@/components/share-button";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { exactTime, initials, timeAgo } from "@/lib/format";
import { imagesFromPost, photosBesideCard } from "@/lib/social/post-photos";
import { quoteCount } from "@/lib/social/quotes";
import type { Post, PostComment, Profile, PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { MailDayCard } from "@/components/mail-day-card";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { shareTitleForPost } from "@/lib/social/mail-day-copy";
import { useAttachedChip } from "@/lib/social/use-attachment-label";
import type { CardValueResult } from "@/lib/value/types";

export function Tweet({
  post,
  author,
  variant = "feed",
  onReply,
  onQuotesClick,
  repostedBy = null,
  extraPosts,
  extraProfiles,
  cardValues,
  cardValuesLoading,
}: {
  post: Post;
  author: Profile;
  variant?: "feed" | "detail";
  onReply?: () => void;
  onQuotesClick?: () => void;
  repostedBy?: Profile | null;
  extraPosts?: Post[];
  extraProfiles?: Profile[];
  /** Extra trusted values when posts were loaded outside the main feed batch. */
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const router = useRouter();
  const openImage = useImageLightbox();
  const photos = photosBesideCard(imagesFromPost(post), post.card?.photoDataUrl);
  const { commentsFor, findPost } = useSocial();
  const comments = commentsFor(post.id);
  const quoteAvailable = Boolean(findPost(post.id));

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
          href={userHref(repostedBy.username)}
          className="flex items-center gap-3 px-4 pt-3 text-[13px] font-bold text-zinc-500"
        >
          <span className="grid w-10 shrink-0 place-items-center">
            <Repeat2 className="h-4 w-4" />
          </span>
          <span className="truncate hover:underline">{repostedBy.displayName} reposted</span>
        </Link>
      ) : null}
      <div className={`flex gap-3 px-4 ${repostedBy ? "pt-1 pb-3" : "py-3"}`}>
      <Link href={userHref(author.username)} className="shrink-0">
        <Avatar name={author.displayName} image={author.avatarDataUrl} accent={author.accent} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <AuthorLine
            name={author.displayName}
            username={author.username}
            href={userHref(author.username)}
            createdAt={post.createdAt}
          />
          <PostMenu post={post} />
        </div>
        {post.body ? (
          <p className={`whitespace-pre-wrap ${bodyClass}`}>
            <MentionText text={post.body} />
          </p>
        ) : null}
        {post.postType === "mail_day" && post.card ? (
          <MailDayCard
            post={post}
            username={author.username}
            variant={variant}
            cardValues={cardValues}
            cardValuesLoading={cardValuesLoading}
          />
        ) : (
          <>
            {photos.length ? <PostPhotoGrid images={photos} onOpen={openImage} /> : null}
            {post.card ? (
              <CardMedia
                card={post.card}
                username={author.username}
                cardValues={cardValues}
                cardValuesLoading={cardValuesLoading}
              />
            ) : null}
          </>
        )}
        {post.quotedPostId ? (
          <QuotedPostEmbed
            quotedPostId={post.quotedPostId}
            extraPosts={extraPosts}
            extraProfiles={extraProfiles}
            cardValues={cardValues}
            cardValuesLoading={cardValuesLoading}
          />
        ) : null}
        <Engagement
          targetId={post.id}
          replyCount={comments.length}
          onReply={openReplies}
          sharePath={`/posts/${post.id}`}
          shareTitle={shareTitleForPost(post)}
          shareText={post.body}
          quoteAvailable={quoteAvailable}
          onQuotesClick={variant === "detail" ? onQuotesClick : undefined}
        />
        {variant === "feed" ? <CommentPreview postId={post.id} comments={comments} /> : null}
      </div>
      </div>
    </article>
  );
}

function CommentPreview({ postId, comments }: { postId: string; comments: PostComment[] }) {
  const { profiles } = useSocial();
  if (comments.length === 0) return null;
  const preview = comments.slice(-2);
  const authors = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <div className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-2.5 dark:border-white/10">
      {preview.map((comment) => {
        const person = authors.get(comment.authorId);
        const name = person?.displayName ?? "Collector";
        const href = person ? userHref(person.username) : null;
        return (
          <div key={comment.id} className="flex min-w-0 gap-2">
            {href ? (
              <Link
                href={href}
                className={`${person?.avatarDataUrl ? "" : "hit-44"} mt-0.5 inline-flex shrink-0`}
              >
                <Avatar
                  name={name}
                  image={person?.avatarDataUrl}
                  accent={person?.accent}
                  className="h-6 w-6 text-[9px]"
                />
              </Link>
            ) : (
              <Avatar name={name} className="mt-0.5 h-6 w-6 text-[9px]" />
            )}
            <div className="min-w-0">
              {href ? (
                <Link href={href} className="block truncate text-[13px] leading-5 font-bold hover:underline">
                  {name}
                </Link>
              ) : (
                <p className="truncate text-[13px] leading-5 font-bold">{name}</p>
              )}
              <p className="line-clamp-2 text-[13px] leading-5 text-zinc-600 dark:text-zinc-300">
                <MentionText text={comment.body} />
              </p>
            </div>
          </div>
        );
      })}
      {comments.length > preview.length ? (
        <Link
          href={`/posts/${postId}`}
          className="inline-block text-[13px] font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          View all comments
        </Link>
      ) : null}
    </div>
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
  const { user, profiles, deletePost } = useSocial();
  const author = profiles.find((profile) => profile.id === post.authorId);
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

  if (!user) return null;
  if (!mine) {
    if (!author) return null;
    return (
      <SafetyMenu
        targetType="post"
        targetId={post.id}
        reportedUserId={author.id}
        username={author.username}
      />
    );
  }

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
  sharePath,
  shareTitle,
  shareText,
  quoteAvailable = true,
  onQuotesClick,
}: {
  targetId: string;
  replyCount?: number;
  onReply: () => void;
  sharePath?: string;
  shareTitle?: string;
  shareText?: string;
  /** False when the post is unavailable and Quote should be disabled. */
  quoteAvailable?: boolean;
  onQuotesClick?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const {
    user,
    posts,
    toggleLike,
    toggleRepost,
    isLiked,
    isReposted,
    likeCount,
    repostCount,
  } = useSocial();
  const liked = isLiked(targetId);
  const reposted = isReposted(targetId);
  const quotes = quoteCount(posts, targetId);
  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const repostMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repostMenuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!repostMenuRef.current?.contains(event.target as Node)) {
        setRepostMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRepostMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [repostMenuOpen]);

  function requireUser() {
    if (user) return true;
    router.push(signupPath(pathname));
    return false;
  }

  return (
    <div className="mt-1.5 -ml-2 flex items-center text-zinc-500">
      <ActionButton label="Reply" count={replyCount} active={false} tone="sky" onClick={onReply}>
        <MessageCircle className="h-[18px] w-[18px]" />
      </ActionButton>
      <div ref={repostMenuRef} className="relative flex min-h-9 flex-1 items-center">
        <ActionButton
          label={reposted ? "Repost options" : "Repost"}
          count={repostCount(targetId)}
          active={reposted}
          pressed={reposted}
          tone="emerald"
          onClick={() => {
            if (!requireUser()) return;
            setRepostMenuOpen((open) => !open);
          }}
        >
          <Repeat2 className="h-[18px] w-[18px]" />
        </ActionButton>
        {repostMenuOpen ? (
          <div
            role="menu"
            className="absolute bottom-10 left-0 z-30 w-44 overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRepostMenuOpen(false);
                toggleRepost(targetId);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <Repeat2 className="h-4 w-4" />
              {reposted ? "Undo repost" : "Repost"}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!quoteAvailable}
              onClick={() => {
                if (!quoteAvailable) return;
                setRepostMenuOpen(false);
                router.push(`/compose?quote=${encodeURIComponent(targetId)}`);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/10"
            >
              <Quote className="h-4 w-4" />
              Quote
            </button>
          </div>
        ) : null}
      </div>
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
      {onQuotesClick ? (
        <ActionButton
          label="Quotes"
          count={quotes}
          active={false}
          tone="sky"
          onClick={onQuotesClick}
        >
          <Quote className="h-[18px] w-[18px]" />
        </ActionButton>
      ) : null}
      {sharePath ? (
        <ShareAction path={sharePath} title={shareTitle ?? "Slabhold"} text={shareText} />
      ) : null}
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
      className={`hit-44 group inline-flex min-h-9 flex-1 items-center ${active ? on : color}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${wash}`}>{children}</span>
      {count > 0 ? <span className="text-[13px] tabular-nums">{count}</span> : null}
    </button>
  );
}

function CardMedia({
  card,
  username,
  cardValues,
  cardValuesLoading,
}: {
  card: PublicCard;
  username: string;
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const { cards } = useCollection();
  const chip = useAttachedChip(card, {
    values: cardValues,
    loading: cardValuesLoading,
  });
  const price = chip.text;
  const soldHref = chip.soldHref;
  const owned = cards.some((item) => item.id === card.id);
  const href = owned
    ? `/cards/${card.id}`
    : `${userHref(username)}/cards/${encodeURIComponent(card.id)}`;
  return (
    <div className="mt-3">
      <Link
        href={href}
        className="block overflow-hidden rounded-2xl border border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
      >
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
            {card.yearLabel || card.year} {card.setBrand}
            {card.cardNumber ? ` · #${card.cardNumber}` : ""}
            {price ? ` · ${price}` : ""}
          </p>
        </div>
      </Link>
      {soldHref ? (
        <p className="px-1 pt-1.5 text-xs text-zinc-500">
          <EbaySoldLink href={soldHref} />
        </p>
      ) : null}
    </div>
  );
}
