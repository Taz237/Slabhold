/**
 * Live inbox and post listeners.
 * The site snapshot (including the public_cards list) is not part of this path.
 */

import type { DirectMessage, Notification, PostComment, PostRepost } from "./types";
import { applyInboxRefresh, type InboxRefresh } from "./inbox-pages";

export const REALTIME_DEBOUNCE_MS = 5_000;

export type RealtimeSlice = "notifications" | "messages" | "comments" | "reposts";

export type RealtimeTable = "notifications" | "messages" | "comments" | "reposts";

export type RealtimeBinding = {
  table: RealtimeTable;
  filter: string;
  slice: RealtimeSlice;
};

export type CatalogLoadSource = "mount" | "explicit" | "realtime";

/**
 * public_cards is loaded with the site snapshot.
 * Mount loads it once. Explicit actions (pull to refresh, sign-in, publish) may load it again.
 * A realtime event must not.
 */
export function shouldFetchPublicCatalog(input: {
  loaded: boolean;
  source: CatalogLoadSource;
}): boolean {
  if (input.source === "realtime") return false;
  if (input.source === "explicit") return true;
  return !input.loaded;
}

function viewerInboxBindings(viewerId: string): RealtimeBinding[] {
  return [
    {
      table: "notifications",
      filter: `recipient_id=eq.${viewerId}`,
      slice: "notifications",
    },
    {
      table: "messages",
      filter: `receiver_id=eq.${viewerId}`,
      slice: "messages",
    },
    {
      table: "messages",
      filter: `sender_id=eq.${viewerId}`,
      slice: "messages",
    },
  ];
}

function postBindings(postId: string): RealtimeBinding[] {
  return [
    { table: "comments", filter: `post_id=eq.${postId}`, slice: "comments" },
    { table: "reposts", filter: `post_id=eq.${postId}`, slice: "reposts" },
  ];
}

/**
 * Home with a snapshot listens only to the signed-in viewer's inbox.
 * A post screen keeps that post's comments and reposts, plus the inbox when someone is signed in.
 * Signed-out home subscribes to nothing. App-wide comments and reposts are never included.
 */
export function realtimeBindings(input: {
  viewerId: string | null;
  postId: string | null;
  fullSnapshot: boolean;
}): RealtimeBinding[] {
  const inbox = input.viewerId ? viewerInboxBindings(input.viewerId) : [];
  if (!input.postId) {
    if (!input.fullSnapshot) return [];
    return inbox;
  }
  return [...postBindings(input.postId), ...inbox];
}

export type RealtimePatch = {
  /** Newest notification and message pages plus unread rows (lib/social/inbox-pages.ts). */
  inbox?: InboxRefresh;
  comments?: PostComment[];
  reposts?: PostRepost[];
  postId?: string;
};

type PatchSnapshot = {
  user: { id: string } | null;
  notifications: Notification[];
  messages: DirectMessage[];
  comments: PostComment[];
  reposts: PostRepost[];
};

/** Merge one inbox or post slice. Leaves every other field, including publicCards, as-is. */
export function applyRealtimePatch<T extends PatchSnapshot>(existing: T, patch: RealtimePatch): T {
  let next = patch.inbox ? applyInboxRefresh(existing, patch.inbox) : existing;
  if (patch.comments !== undefined && patch.postId) {
    next = {
      ...next,
      comments: [
        ...next.comments.filter((comment) => comment.postId !== patch.postId),
        ...patch.comments,
      ],
    };
  }
  if (patch.reposts !== undefined && patch.postId) {
    next = {
      ...next,
      reposts: [
        ...next.reposts.filter((repost) => repost.postId !== patch.postId),
        ...patch.reposts,
      ],
    };
  }
  return next;
}

/**
 * Trailing debounce. While the document is hidden, events are remembered and
 * one reload runs when the tab becomes visible.
 */
export function createRealtimeScheduler(options: {
  debounceMs: number;
  hidden: () => boolean;
  reload: (slices: ReadonlySet<RealtimeSlice>) => void;
  schedule: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
}) {
  let timer = 0;
  let pending = new Set<RealtimeSlice>();

  const flush = () => {
    timer = 0;
    if (pending.size === 0) return;
    if (options.hidden()) return;
    const slices = pending;
    pending = new Set();
    options.reload(slices);
  };

  return {
    onEvent(slice: RealtimeSlice) {
      pending.add(slice);
      if (options.hidden()) {
        if (timer) options.cancel(timer);
        timer = 0;
        return;
      }
      if (timer) options.cancel(timer);
      timer = options.schedule(flush, options.debounceMs);
    },
    onVisible() {
      if (options.hidden() || pending.size === 0) return;
      if (timer) options.cancel(timer);
      timer = 0;
      flush();
    },
    dispose() {
      if (timer) options.cancel(timer);
      timer = 0;
      pending = new Set();
    },
  };
}
