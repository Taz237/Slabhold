import type { FeedCursor } from "./feed-page";
import {
  checklistDismissKey,
  checklistNewUserKey,
  checklistState,
  profileStepDone,
  type ChecklistState,
} from "./get-started";
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
  /**
   * Unique to the request that read it. The timeline draws a server page
   * once, on the mount that request produced; a replay of the same payload
   * (Back through the router cache) loads fresh instead. No clocks compared,
   * so a phone with an off clock draws exactly what the server sent.
   */
  token: string;
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
  cardCount: number;
  /**
   * Get started as the server can see it: shown for a recent account with
   * steps left. Whether this device dismissed it, or first saw this account
   * as not new, lives in localStorage; getStartedHintScript settles that
   * before the first paint.
   */
  getStarted: ChecklistState;
  /** No follows and no cards right now: what the browser stores as "new" on a first load. */
  newNow: boolean;
};

/** Get started for the first screen, from the counts the server read. */
export function seededChecklist(input: {
  viewer: Profile;
  followingCount: number;
  cardCount: number;
  now?: number;
}): ChecklistState {
  return checklistState({
    cardCount: input.cardCount,
    followingCount: input.followingCount,
    profileDone: profileStepDone({ avatarDataUrl: input.viewer.avatarDataUrl, bio: input.viewer.bio }),
    dismissed: false,
    ready: true,
    createdAt: input.viewer.createdAt,
    wasNewUser: true,
    now: input.now,
  });
}

/**
 * Runs in the page before it paints, like the session hint. Tags
 * <html data-get-started-hidden> when this device dismissed Get started, or
 * when its stored first answer (or, before one is stored, the counts right
 * now) says this account isn't new: the same test the browser makes once
 * the snapshot is in, so nothing appears or vanishes at the hand-over.
 */
export function getStartedHintScript(userId: string, newNow: boolean): string {
  const dismissKey = JSON.stringify(checklistDismissKey(userId));
  const newKey = JSON.stringify(checklistNewUserKey(userId));
  const notNewNow = newNow ? "false" : "true";
  return `try{var s=localStorage,n=s.getItem(${newKey});if(s.getItem(${dismissKey})==="1"||n==="0"||(n!=="1"&&${notNewNow}))document.documentElement.dataset.getStartedHidden=""}catch(e){}`;
}
