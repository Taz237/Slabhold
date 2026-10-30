import type { FeedCursor } from "./feed-page";
import { isRecentAccount } from "./get-started";
import type { SuggestedProfile } from "./suggestion-order";
import type { TimelineItem } from "./timeline";
import type { FollowEdge, Post, PostComment, PostLike, PostRepost, Profile } from "./types";

/** The first page of one Home tab, as the paged timeline holds it. */
export type HomeSeedPage = {
  items: TimelineItem[];
  posts: Post[];
  relatedPosts: Post[];
  profiles: Profile[];
  hasMore: boolean;
  nextCursor: FeedCursor | null;
  likes: PostLike[] | null;
  /** When the server read it (ms). A page past the timeline's memory window is read again. */
  readAt: number;
};

/**
 * Signed-in Home's first screen, read on the server for this request only
 * (never cached): the viewer, the tab Home opens on, its first page, and the
 * replies, reposts, and suggestions those rows show. The client draws it
 * until the full snapshot is in, then hands over without a redraw.
 */
export type HomeSeed = {
  viewer: Profile;
  lane: "foryou" | "following";
  /** The viewer's own follow edges. */
  follows: FollowEdge[];
  blockedIds: string[];
  mutedIds: string[];
  page: HomeSeedPage;
  /** Everyone the first page names: authors, quoted authors, repliers. */
  profiles: Profile[];
  comments: PostComment[];
  reposts: PostRepost[];
  /** Null when suggest_collectors is not installed. */
  suggestions: SuggestedProfile[] | null;
};

/**
 * Seed only when the first screen can't change once the snapshot is in. A
 * recent account can still get Get started, and an empty collection gets the
 * first-card prompt above the feed. Those keep the skeleton, as before.
 */
export function homeSeedEligible(input: { createdAt: string; cardCount: number; now?: number }): boolean {
  if (input.cardCount <= 0) return false;
  return !isRecentAccount(input.createdAt, input.now ?? Date.now());
}
