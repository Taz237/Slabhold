"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CardMessagePreviewBody, SharedCardPhoto } from "@/components/open-to-offers";
import { useSocial } from "@/components/social-provider";
import { resolveLiveCardPreview } from "@/lib/offers/open-to-offers";
import { messageLinks, type MessageLink } from "@/lib/social/dm-inbox";
import { imagesFromPost } from "@/lib/social/post-photos";
import type { DirectMessage, OwnedCard, Post, Profile } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { gradedLabel } from "@/lib/ui/timeline";

type Loaded = {
  findPost: (id: string) => Post | undefined;
  profiles: readonly Profile[];
  publicCards: readonly OwnedCard[];
  blockedIds: readonly string[];
};

/** A public card that's already loaded, with its link built from the owner's real handle. */
function linkedCard(cardId: string, loaded: Loaded) {
  const card = loaded.publicCards.find((item) => item.id === cardId);
  if (!card || loaded.blockedIds.includes(card.ownerId)) return null;
  const owner = loaded.profiles.find((profile) => profile.id === card.ownerId);
  if (!owner) return null;
  return {
    href: `${userHref(owner.username)}/cards/${encodeURIComponent(card.id)}`,
    imageUrl: card.photoDataUrl,
    player: card.playerName,
    year: (card.yearLabel || String(card.year)).trim(),
    set: card.setBrand,
    grade: gradedLabel(card),
  };
}

function linkedPost(postId: string, loaded: Loaded) {
  const post = loaded.findPost(postId);
  if (!post || post.hiddenAt || loaded.blockedIds.includes(post.authorId)) return null;
  const author = loaded.profiles.find((profile) => profile.id === post.authorId);
  return author ? { post, author } : null;
}

/**
 * Rich mini cards for Slabhold post and card links in a message. Only things
 * already loaded on this device are drawn; anything else stays a plain link.
 */
export function MessageAttachments({ text }: { text: string }) {
  const { findPost, profiles, publicCards, blockedIds } = useSocial();
  const loaded = { findPost, profiles, publicCards, blockedIds };
  const links = messageLinks(text);
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link: MessageLink) => {
        if (link.kind === "card") {
          const card = linkedCard(link.cardId, loaded);
          return card ? <CardMessagePreviewBody key={`card-${link.cardId}`} card={card} /> : null;
        }
        const found = linkedPost(link.id, loaded);
        return found ? (
          <SharedPostMini key={`post-${link.id}`} post={found.post} author={found.author} />
        ) : null;
      })}
    </>
  );
}

function SharedPostMini({ post, author }: { post: Post; author: Profile }) {
  const photo = post.card?.photoDataUrl ?? imagesFromPost(post)[0] ?? null;
  return (
    <Link
      href={`/posts/${encodeURIComponent(post.id)}`}
      data-shared-post=""
      className="mt-1 flex w-64 max-w-full gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-[0_10px_28px_-20px_rgba(124,58,237,0.55)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none dark:border-white/10 dark:bg-zinc-900"
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar
            name={author.displayName}
            image={author.avatarDataUrl}
            accent={author.accent}
            expandable={false}
            className="h-5 w-5 text-[8px]"
          />
          <span className="truncate text-[13px] font-bold tracking-tight">{author.displayName}</span>
          <span className="truncate text-[13px] text-zinc-500">@{author.username}</span>
        </span>
        {post.body ? (
          <span className="mt-1 line-clamp-2 text-[14px] leading-5 text-zinc-700 dark:text-zinc-200">{post.body}</span>
        ) : (
          <span className="mt-1 block text-[14px] leading-5 text-zinc-500">View post</span>
        )}
      </span>
      {photo || post.card ? (
        <SharedCardPhoto imageUrl={photo} player={post.card?.playerName ?? author.displayName} />
      ) : null}
    </Link>
  );
}

/** The photo for an inbox row: a shared card, or the card or photo on a linked post. */
export function useInboxThumb(last: DirectMessage): { imageUrl: string | null; label: string } | null {
  const { findPost, profiles, publicCards, blockedIds } = useSocial();
  const loaded = { findPost, profiles, publicCards, blockedIds };
  if (last.cardPreview) {
    const live = resolveLiveCardPreview(last.cardPreview.cardId, publicCards, profiles);
    return live ? { imageUrl: live.imageUrl, label: live.player } : null;
  }
  const [link] = messageLinks(last.content);
  if (!link) return null;
  if (link.kind === "card") {
    const card = linkedCard(link.cardId, loaded);
    return card ? { imageUrl: card.imageUrl, label: card.player } : null;
  }
  const found = linkedPost(link.id, loaded);
  if (!found) return null;
  const photo = found.post.card?.photoDataUrl ?? imagesFromPost(found.post)[0] ?? null;
  if (!photo && !found.post.card) return null;
  return { imageUrl: photo, label: found.post.card?.playerName ?? found.author.displayName };
}

export function InboxThumb({ thumb }: { thumb: { imageUrl: string | null; label: string } }) {
  return (
    <span data-inbox-thumb="" className="shrink-0">
      <SharedCardPhoto imageUrl={thumb.imageUrl} player={thumb.label} size="sm" />
    </span>
  );
}
