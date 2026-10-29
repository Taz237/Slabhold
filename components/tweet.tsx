"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Ellipsis, Heart, MessageCircle, Pin, Quote, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCollection } from "@/components/collection-provider";
import { useImageLightbox } from "@/components/image-lightbox";
import { PostCardTile, postCardHref } from "@/components/post-card-tile";
import { PostPhotoGrid } from "@/components/post-photo-grid";
import { ReplyPhotos } from "@/components/reply-photos";
import { MentionText } from "@/components/mention-text";
import { QuotedPostEmbed } from "@/components/quoted-post-embed";
import { SafetyMenu } from "@/components/safety-menu";
import { ShareAction } from "@/components/share-button";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { exactTime, timeAgo } from "@/lib/format";
import { imagesFromPost, photosBesideCard } from "@/lib/social/post-photos";
import { quoteCount } from "@/lib/social/quotes";
import type { Post, PostComment, Profile, PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { MailDayCard } from "@/components/mail-day-card";
import { shareTitleForPost } from "@/lib/social/mail-day-copy";
import { useAttachedChip } from "@/lib/social/use-attachment-label";
import { PostBody, PostPill, useReducedMotion } from "@/components/timeline-ui";
import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { gradedLabel, postPill } from "@/lib/ui/timeline";
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
  pinned = false,
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
  /** Profile Posts tab. The same post is not repeated under this label. */
  pinned?: boolean;
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

  const bodyClass = variant === "detail" ? "text-[17px] leading-6" : "text-[15px] leading-[1.4]";
  const pill = postPill(post);
  const graded = Boolean(post.card && post.postType !== "mail_day" && gradedLabel(post.card));

  return (
    <article
      onClick={openPost}
      className={`border-b border-zinc-200/70 dark:border-white/[0.07] ${
        variant === "feed"
          ? "cursor-pointer transition-colors duration-150 hover:bg-zinc-900/[0.015] dark:hover:bg-white/[0.015]"
          : ""
      }`}
    >
      {pinned ? (
        <p className="flex items-center gap-3 px-4 pt-3 text-[13px] font-bold text-zinc-500">
          <span className="grid w-10 shrink-0 place-items-center">
            <Pin className="h-4 w-4" aria-hidden="true" />
          </span>
          Pinned
        </p>
      ) : null}
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
      <div className={`flex gap-3 px-4 pb-1.5 ${pinned || repostedBy ? "pt-1" : "pt-3.5"}`}>
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
            official={isOfficialUpdatesAccount(author.id)}
          />
          <PostMenu post={post} />
        </div>
        {post.body ? (
          <div className="mt-1">
            <PostBody text={post.body} className={bodyClass} collapsible={variant === "feed"} />
          </div>
        ) : null}
        {pill && post.postType === "mail_day" ? (
          <div className="mt-3 -mb-1">
            <PostPill label={pill} />
          </div>
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
            {post.card && pill ? (
              <div className="mt-3 -mb-1 flex justify-center">
                <PostPill label={pill} solid={graded} />
              </div>
            ) : null}
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
    <div className="mt-1 mb-2 space-y-2 border-l-2 border-zinc-200/70 pl-2.5 dark:border-white/[0.07]">
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
              {comment.body ? (
                <p className="line-clamp-2 text-[13px] leading-5 text-zinc-600 dark:text-zinc-300">
                  <MentionText text={comment.body} />
                </p>
              ) : null}
              <ReplyPhotos images={comment.images} />
            </div>
          </div>
        );
      })}
      {comments.length > preview.length ? (
        <Link
          href={`/posts/${postId}`}
          className="inline-block text-[13px] font-medium text-violet-600 hover:underline dark:text-[#A78BFA]"
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
  official = false,
}: {
  name: string;
  username: string;
  href: string;
  createdAt: string;
  /** The official updates account, matched by profile id. */
  official?: boolean;
}) {
  const relative = timeAgo(createdAt);
  const exact = exactTime(createdAt);

  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-x-1 text-[15px]">
      <Link href={href} className="max-w-[52%] truncate font-bold tracking-tight hover:underline">
        {name}
      </Link>
      {official ? (
        <BadgeCheck
          data-official-mark=""
          role="img"
          aria-label="Official Slabhold account"
          className="h-4 w-4 shrink-0 self-center fill-violet-600 text-white dark:fill-violet-500 dark:text-[#09090B]"
        />
      ) : null}
      <span className="min-w-0 truncate text-[14px] text-zinc-500">@{username}</span>
      {relative ? (
        <time
          dateTime={createdAt}
          title={exact || undefined}
          className="shrink-0 text-[14px] whitespace-nowrap text-zinc-500"
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
  const { user, profiles, deletePost, pinPost, unpinPost } = useSocial();
  const author = profiles.find((profile) => profile.id === post.authorId);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pinning, setPinning] = useState(false);
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
              {user.pinnedPostId === post.id ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pinning}
                  onClick={() => {
                    if (!user) return;
                    setPinning(true);
                    void unpinPost().finally(() => {
                      setPinning(false);
                      close();
                    });
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-white/10"
                >
                  Unpin
                </button>
              ) : post.hiddenAt ? null : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pinning}
                  onClick={() => {
                    if (!user) return;
                    setPinning(true);
                    void pinPost(post.id).finally(() => {
                      setPinning(false);
                      close();
                    });
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-white/10"
                >
                  Pin to profile
                </button>
              )}
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
  const reduceMotion = useReducedMotion();
  /** Bumped to replay the heart pop or repost bounce. Stays 0 under reduced motion. */
  const [likeBurst, setLikeBurst] = useState(0);
  const [repostBurst, setRepostBurst] = useState(0);

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
    <div data-engagement="" className="mt-0.5 -ml-2.5 flex min-w-0 items-center text-zinc-500">
      <ActionButton label="Reply" count={replyCount} active={false} tone="sky" onClick={onReply}>
        <MessageCircle className="h-[18px] w-[18px]" />
      </ActionButton>
      <div ref={repostMenuRef} className="relative flex min-h-11 min-w-0 flex-1 items-center">
        <ActionButton
          label={reposted ? "Repost options" : "Repost"}
          count={repostCount(targetId)}
          active={reposted}
          pressed={reposted}
          tone="emerald"
          burst={reposted ? repostBurst : 0}
          burstKind="bounce"
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
                if (!reposted && !reduceMotion) setRepostBurst((count) => count + 1);
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
        burst={liked ? likeBurst : 0}
        burstKind="pop"
        onClick={() => {
          if (!requireUser()) return;
          if (!liked && !reduceMotion) setLikeBurst((count) => count + 1);
          toggleLike(targetId);
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
  burst = 0,
  burstKind,
  onClick,
  children,
}: {
  label: string;
  count: number;
  active: boolean;
  pressed?: boolean;
  tone: "sky" | "emerald" | "rose";
  /** Above 0 plays the pop or bounce once; a new number replays it. */
  burst?: number;
  burstKind?: "pop" | "bounce";
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
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`group inline-flex min-h-11 min-w-0 flex-1 items-center transition-colors duration-150 ${active ? on : color}`}
    >
      <span
        className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-[color,background-color,transform] duration-150 group-active:scale-90 motion-reduce:transform-none ${wash}`}
      >
        {burst > 0 && burstKind === "pop" ? <LikeBurst key={burst} /> : null}
        {burst > 0 && burstKind ? (
          <span
            key={burst}
            data-like-pop={burstKind === "pop" ? "" : undefined}
            data-repost-bounce={burstKind === "bounce" ? "" : undefined}
            className={`grid place-items-center ${
              burstKind === "pop"
                ? "motion-safe:animate-[like-pop_380ms_cubic-bezier(0.2,0.7,0.2,1)]"
                : "motion-safe:animate-[repost-bounce_360ms_ease-out]"
            }`}
          >
            {children}
          </span>
        ) : (
          children
        )}
      </span>
      <TickCount value={count} animate={!reduceMotion} />
    </button>
  );
}

const BURST_SPARKS = [0, 60, 120, 180, 240, 300];

/** A purple ring and six sparks around the heart, once. Only mounted when motion is allowed. */
function LikeBurst() {
  return (
    <span data-like-burst="" aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-0 rounded-full border-2 border-violet-500 opacity-0 motion-safe:animate-[like-ring_460ms_cubic-bezier(0.2,0.7,0.2,1)_both]" />
      {BURST_SPARKS.map((angle) => (
        <span
          key={angle}
          className="absolute top-1/2 left-1/2 h-1 w-1 rounded-full bg-[#A78BFA] opacity-0 motion-safe:animate-[like-spark_520ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
          style={{ "--spark-angle": `${angle}deg` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

/** The count beside an action. A change rolls the new number in from below (up) or above (down). */
function TickCount({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState<{ value: number; dir: "up" | "down" | null }>({ value, dir: null });
  let current = shown;
  if (shown.value !== value) {
    current = { value, dir: animate ? (value > shown.value ? "up" : "down") : null };
    setShown(current);
  }
  if (value <= 0) return null;
  return (
    <span className="min-w-0 overflow-hidden pr-1 text-[13px] tabular-nums">
      <span
        key={value}
        data-count=""
        data-count-dir={current.dir ?? undefined}
        className={`block truncate ${
          current.dir === "up"
            ? "motion-safe:animate-[count-up_240ms_cubic-bezier(0.2,0.7,0.2,1)]"
            : current.dir === "down"
              ? "motion-safe:animate-[count-down_240ms_cubic-bezier(0.2,0.7,0.2,1)]"
              : ""
        }`}
      >
        {value}
      </span>
    </span>
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
  const owned = cards.some((item) => item.id === card.id);
  return (
    <PostCardTile
      card={card}
      href={postCardHref({ cardId: card.id, username, owned })}
      priceText={chip.text}
      soldHref={chip.soldHref}
    />
  );
}
