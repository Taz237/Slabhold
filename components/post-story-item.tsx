"use client";

import { Download } from "lucide-react";
import { MenuSheetIcon, menuSheetItem } from "@/components/menu-sheet";
import { postStoryFilename, postStoryPath } from "@/lib/share/links";
import { shareImage } from "@/lib/share/share-image";
import type { Post } from "@/lib/social/types";
import { isUuid } from "@/lib/value/card-value-access";

/**
 * Only posts everyone can see get a Story image: a saved, server post (a
 * uuid id) that is not hidden. The route checks again and 404s the rest.
 */
export function canShareStory(post: Pick<Post, "id" | "hiddenAt">): boolean {
  return isUuid(post.id) && !post.hiddenAt;
}

/** One fetch per post per page load, started on press so the tap can still share. */
const pending = new Map<string, Promise<Blob | null>>();

function warm(postId: string): Promise<Blob | null> {
  let story = pending.get(postId);
  if (!story) {
    story = fetch(postStoryPath(postId))
      .then((response) => (response.ok ? response.blob() : null))
      .catch(() => null);
    pending.set(postId, story);
  }
  return story;
}

async function saveStory(postId: string, username: string): Promise<void> {
  const src = postStoryPath(postId);
  const blob = await warm(postId);
  if (!blob) {
    pending.delete(postId);
    window.open(src, "_blank", "noopener");
    return;
  }
  await shareImage({ blob, filename: postStoryFilename(username), title: "Post on Slabhold", src, source: "post" });
}

/**
 * "Share to Story" in a post's ⋯ menu: the 1080×1920 image of the post,
 * handed to the share sheet (Save Image, Instagram) the way the collection
 * image is. Nothing for a post the viewer couldn't share.
 */
export function ShareToStoryItem({
  post,
  username,
  onDone,
}: {
  post: Pick<Post, "id" | "hiddenAt">;
  /** The author's handle, for the saved file's name. */
  username: string;
  onDone: () => void;
}) {
  if (!canShareStory(post)) return null;
  return (
    <button
      type="button"
      role="menuitem"
      data-share-story=""
      className={menuSheetItem}
      onPointerDown={() => void warm(post.id)}
      onClick={() => {
        onDone();
        void saveStory(post.id, username);
      }}
    >
      <MenuSheetIcon icon={Download} />
      Share to Story
    </button>
  );
}
