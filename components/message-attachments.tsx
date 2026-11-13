"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CardMessagePreviewBody, SharedCardPhoto } from "@/components/open-to-offers";
import { useSocial } from "@/components/social-provider";
import { resolveLiveCardPreview } from "@/lib/offers/open-to-offers";
import { loadPostById } from "@/lib/social/load-feed-page";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { messageLinks, type MessageLink } from "@/lib/social/dm-inbox";
import { imagesFromPost } from "@/lib/social/post-photos";
import type { DirectMessage, OwnedCard, Post, Profile } from "@/lib/social/types";
import { usePublicCards } from "@/lib/social/use-public-cards";
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

/** A shared post's read from the server: still going, found, or done and not there. */
export type PostRead = "pending" | "found" | "missing";

/** Post ids read for DM previews, shared by every bubble. Found posts go to rememberPosts. */
const postReads = new Map<string, PostRead>();
const readListeners = new Set<() => void>();

/**
 * What a post link in a message draws: the mini card, "Post unavailable"
 * (hidden, a blocked author, or gone), or nothing yet while it's read.
 */
export function sharedPostState(
  postId: string,
  loaded: Loaded,
  read: PostRead | undefined,
): { kind: "shown"; post: Post; author: Profile } | { kind: "unavailable" } | { kind: "pending" } {
  const post = loaded.findPost(postId);
  if (post) {
    const found = linkedPost(postId, loaded);
    return found ? { kind: "shown", ...found } : { kind: "unavailable" };
  }
  return read === "missing" ? { kind: "unavailable" } : { kind: "pending" };
}

/**
 * Reads posts a thread links that aren't loaded on this device yet, once
 * each. On-device accounts have every post already, so a miss is gone.
 */
function usePostReads(ids: readonly string[]): (id: string) => PostRead | undefined {
  const { mode, user, findPost, rememberPosts } = useSocial();
  const [, setTick] = useState(0);
  const key = ids.filter((id) => !findPost(id)).join(",");
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    readListeners.add(listener);
    return () => {
      readListeners.delete(listener);
    };
  }, []);
  const viewerId = user?.id ?? null;
  useEffect(() => {
    if (!key || mode !== "supabase") return;
    for (const id of key.split(",")) {
      if (postReads.has(id)) continue;
      postReads.set(id, "pending");
      void loadSupabaseBrowser()
        .then((supabase) => (supabase ? loadPostById(supabase, id, viewerId) : null))
        .then((result) => {
          if (result) {
            // Kept as read: findPost has it once rememberPosts lands.
            postReads.set(id, "found");
            rememberPosts([result.post, ...result.relatedPosts], result.profiles);
          } else {
            postReads.set(id, "missing");
          }
          for (const listener of readListeners) listener();
        })
        // A failed read stays a plain link; the next thread open tries again.
        .catch(() => postReads.delete(id));
    }
  }, [key, mode, rememberPosts, viewerId]);
  return (id) => (mode === "supabase" ? postReads.get(id) : "missing");
}

/**
 * Rich mini cards for Slabhold post and card links in a message. Only things
 * already loaded on this device are drawn; anything else stays a plain link.
 */
export function MessageAttachments({ text }: { text: string }) {
  const { findPost, profiles, publicCards, blockedIds } = useSocial();
  const loaded = { findPost, profiles, publicCards, blockedIds };
  const links = messageLinks(text);
  usePublicCards({ ids: links.map((link) => (link.kind === "card" ? link.cardId : null)) });
  const readOf = usePostReads(links.flatMap((link) => (link.kind === "post" ? [link.id] : [])));
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link: MessageLink) => {
        if (link.kind === "card") {
          const card = linkedCard(link.cardId, loaded);
          return card ? <CardMessagePreviewBody key={`card-${link.cardId}`} card={card} /> : null;
        }
        const state = sharedPostState(link.id, loaded, readOf(link.id));
        if (state.kind === "unavailable") return <PostUnavailable key={`post-${link.id}`} />;
        return state.kind === "shown" ? (
          <SharedPostMini key={`post-${link.id}`} post={state.post} author={state.author} />
        ) : null;
      })}
    </>
  );
}

/** A shared post that's hidden, by a blocked author, or gone. The link text stays in the bubble. */
function PostUnavailable() {
  return (
    <span
      data-post-unavailable=""
      className="mt-1 inline-flex min-h-7 items-center rounded-full bg-zinc-100 px-3 text-13 font-medium text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400"
    >
      Post unavailable
    </span>
  );
}

function SharedPostMini({ post, author }: { post: Post; author: Profile }) {
  const photo = post.card?.photoDataUrl ?? imagesFromPost(post)[0] ?? null;
  return (
    <Link
      href={`/posts/${encodeURIComponent(post.id)}`}
      data-shared-post=""
      className="mt-1 flex w-64 max-w-full gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none dark:border-white/10 dark:bg-zinc-900 dark:shadow-none"
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
          <span className="truncate text-13 font-semibold tracking-tight">{author.displayName}</span>
          <span className="truncate text-13 text-zinc-500">@{author.username}</span>
        </span>
        {post.body ? (
          <span className="mt-1 line-clamp-2 text-14 leading-5 text-zinc-700 dark:text-zinc-200">{post.body}</span>
        ) : (
          <span className="mt-1 block text-14 leading-5 text-zinc-500">View post</span>
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
  const [firstLink] = last.cardPreview ? [] : messageLinks(last.content);
  usePublicCards({
    ids: [last.cardPreview?.cardId, firstLink?.kind === "card" ? firstLink.cardId : null],
  });
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
