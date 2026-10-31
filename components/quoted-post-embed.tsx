"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MentionText } from "@/components/mention-text";
import { useSocial } from "@/components/social-provider";
import { initials, timeAgo } from "@/lib/format";
import { sanitizeAttachedCard } from "@/lib/social/card-posts";
import { resolveQuoteEmbedState } from "@/lib/social/quotes";
import type { Post, Profile, PublicCard } from "@/lib/social/types";
import { useAttachedChip } from "@/lib/social/use-attachment-label";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { LazyPlayerNameLink } from "@/components/player-name-lazy";
import { QUOTE_HEADER } from "@/lib/ui/quote-header";
import type { CardValueResult } from "@/lib/value/types";

export function QuotedPostEmbed({
  quotedPostId,
  className = "",
  extraPosts,
  extraProfiles,
  cardValues,
  cardValuesLoading,
}: {
  quotedPostId: string | null | undefined;
  className?: string;
  /** Posts loaded outside the main social snapshot (e.g. card collectors feed). */
  extraPosts?: Post[];
  extraProfiles?: Profile[];
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const router = useRouter();
  const { posts, profiles } = useSocial();

  const postsById = useMemo(() => {
    const map = new Map(posts.map((post) => [post.id, post]));
    for (const post of extraPosts ?? []) map.set(post.id, post);
    return map;
  }, [extraPosts, posts]);
  const profilesById = useMemo(() => {
    const map = new Map(profiles.map((profile) => [profile.id, profile]));
    for (const profile of extraProfiles ?? []) map.set(profile.id, profile);
    return map;
  }, [extraProfiles, profiles]);

  const state = resolveQuoteEmbedState(quotedPostId, postsById, profilesById);
  const card =
    state.kind === "ok" ? sanitizeAttachedCard(state.post.card) : null;
  const chip = useAttachedChip(card, {
    values: cardValues,
    loading: cardValuesLoading,
  });
  const price = chip.text;
  const soldHref = chip.soldHref;

  if (state.kind === "unavailable") {
    return (
      <div
        className={`mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500 dark:border-white/10 dark:bg-white/5 ${className}`}
      >
        This post is unavailable.
      </div>
    );
  }

  const { post, author, nestedLink } = state;
  const relative = timeAgo(post.createdAt);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target.closest("a, button")) return;
        router.push(`/posts/${post.id}`);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        router.push(`/posts/${post.id}`);
      }}
      className={`mt-3 cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 transition hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/[0.04] ${className}`}
    >
      <div className="flex gap-2.5 px-3 pt-3 pb-2">
        <Avatar
          name={author.displayName}
          image={author.avatarDataUrl}
          accent={author.accent}
          className="h-8 w-8 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className={QUOTE_HEADER.row}>
            <span className={QUOTE_HEADER.name}>{author.displayName}</span>
            <span className={QUOTE_HEADER.handle}>@{author.username}</span>
            {relative ? <span className={QUOTE_HEADER.time}>· {relative}</span> : null}
          </div>
          {post.body ? (
            <p className="mt-0.5 line-clamp-3 break-words text-[14px] leading-5 whitespace-pre-wrap">
              <MentionText text={post.body} />
            </p>
          ) : null}
          {nestedLink ? (
            <p className="mt-1 text-[13px] text-zinc-500">
              Quoting{" "}
              <Link
                href={nestedLink.href}
                onClick={(event) => event.stopPropagation()}
                className="font-medium break-words text-sky-600 hover:underline dark:text-sky-400"
              >
                @{nestedLink.handle}
              </Link>
            </p>
          ) : null}
          {card && (price || soldHref) ? (
            <p className="mt-1 truncate text-[13px] text-zinc-500">
              <LazyPlayerNameLink
                name={card.playerName}
                sport={card.sport}
                className="font-semibold text-zinc-800 hover:underline dark:text-zinc-100"
              />
              {price ? ` · ${price}` : ""}
              {soldHref ? (
                <>
                  {" · "}
                  <EbaySoldLink href={soldHref} />
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {post.imageDataUrl || card ? (
          <EmbedThumb imageUrl={post.imageDataUrl} card={card} />
        ) : null}
      </div>
    </div>
  );
}

function EmbedThumb({
  imageUrl,
  card,
}: {
  imageUrl: string | null;
  card: PublicCard | null;
}) {
  const src = imageUrl || card?.photoDataUrl || null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-14 w-14 shrink-0 rounded-xl object-cover"
      />
    );
  }
  if (card) {
    return (
      <div
        className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-[11px] font-semibold text-white"
        style={{ background: `linear-gradient(160deg, ${card.accent}, #18181b)` }}
      >
        {initials(card.playerName)}
      </div>
    );
  }
  return null;
}

/** Compact preview used in the composer when drafting a quote. */
export function QuoteComposePreview({
  quotedPostId,
  onRemove,
}: {
  quotedPostId: string;
  onRemove: () => void;
}) {
  return (
    <div className="relative mt-3">
      <QuotedPostEmbed quotedPostId={quotedPostId} className="mt-0 pr-10" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove quote"
        className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
