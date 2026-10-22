"use client";

import Link from "next/link";
import { useState } from "react";
import { SHARE_CONFIRM_TEXT, sharePostPath, shareSessionStore, takeSharedPost } from "@/lib/social/share-to-feed";

function savedPostId(cardId: string): string | null {
  try {
    const store = shareSessionStore();
    if (!store) return null;
    return takeSharedPost(store, cardId);
  } catch {
    return null;
  }
}

/** Small note after Add card shares a post. Shown once for this card. */
export function SharedPostNote({ cardId }: { cardId: string }) {
  const [postId] = useState(() => savedPostId(cardId));

  if (!postId) return null;
  return (
    <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
      {SHARE_CONFIRM_TEXT}{" "}
      <Link href={sharePostPath(postId)} className="font-semibold underline underline-offset-2">
        View post
      </Link>
    </p>
  );
}
