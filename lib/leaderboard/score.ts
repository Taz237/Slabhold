import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { userHref } from "@/lib/social/user-href";
import { isTestAccount, normalizeAccountHandle } from "@/lib/test-accounts";
import {
  ACTOR_MIN_AGE_DAYS,
  ACTOR_MIN_CONTENT,
  DAILY_CARD_CAP,
  OFFICIAL_UPDATES_HANDLE,
  type LeaderboardBoardId,
} from "./rules";
import { inWeek, isoDate, zonedParts, type WeekWindow } from "./week";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BoardProfile = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  isTest: boolean;
  avatarUrl: string | null;
  accent: string;
};

export type BoardPost = {
  id: string;
  authorId: string;
  body: string;
  hiddenAt: string | null;
  deleted: boolean;
  /** Card ids attached on the post. Mail Day posts are not scored. */
  cardIds: string[];
  postType: "post" | "mail_day";
  createdAt: string;
};

export type BoardCard = {
  id: string;
  userId: string;
  isPublic: boolean;
  player: string;
  year: number;
  setName: string;
  parallel: string;
  imageUrl: string | null;
  createdAt: string;
  hidden: boolean;
  deleted: boolean;
};

export type BoardLike = {
  actorId: string;
  postId: string;
  createdAt: string;
  /** Unlike deletes the like notification. Those rows are undone. */
  undone: boolean;
};

export type BoardReply = {
  id: string;
  actorId: string;
  postId: string;
  createdAt: string;
  undone: boolean;
  /** Hidden replies do not count. Deleted rows never reach the loader. */
  hidden: boolean;
  deleted: boolean;
};

export type BoardFollow = {
  followerId: string;
  followingId: string;
  createdAt: string;
  /**
   * When the follow was removed, if that fact is still stored.
   * A deleted follows row has no removedAt, so the loader omits it.
   */
  removedAt: string | null;
};

export type BlockPair = {
  blockerId: string;
  blockedId: string;
};

export type ScoreInput = {
  profiles: readonly BoardProfile[];
  posts: readonly BoardPost[];
  cards: readonly BoardCard[];
  /** User ids with at least one non-hidden, non-Mail-Day post, even if that post is not scored. */
  usersWithPost: readonly string[];
  likes: readonly BoardLike[];
  replies: readonly BoardReply[];
  follows: readonly BoardFollow[];
  /** Either direction. A pair drops replies and follows between those two accounts. */
  blockPairs: readonly BlockPair[];
  /** Snapshot time. A card created after this does not count. */
  now: Date;
};

/**
 * Like actors for scoring. Notifications are client-forgeable, so this
 * returns nothing until a follow-up can read a likes table.
 */
export function getPostLikeActors(): readonly BoardLike[] {
  return [];
}

export type Contribution = {
  actorId: string;
  points: number;
};

export type CandidateRow = {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  href: string;
  avatarUrl: string | null;
  accent: string;
  contributions: Contribution[];
};

export type WeekBoards = Partial<Record<LeaderboardBoardId, { rows: CandidateRow[] }>>;

export type ActorIndex = {
  profiles: Map<string, BoardProfile>;
  cardCount: Map<string, number>;
  postCount: Map<string, number>;
  publicCards: Map<string, BoardCard>;
  blocks: Set<string>;
};

function bump(map: Map<string, number>, id: string) {
  if (!id) return;
  map.set(id, (map.get(id) ?? 0) + 1);
}

export function indexInput(input: ScoreInput): ActorIndex {
  const profiles = new Map<string, BoardProfile>();
  for (const profile of input.profiles) profiles.set(profile.id, profile);
  const cardCount = new Map<string, number>();
  const publicCards = new Map<string, BoardCard>();
  for (const card of input.cards) {
    bump(cardCount, card.userId);
    if (card.isPublic) publicCards.set(card.id, card);
  }
  const postCount = new Map<string, number>();
  const listedPosts = new Set(input.usersWithPost);
  for (const userId of input.usersWithPost) bump(postCount, userId);
  for (const post of input.posts) {
    if (post.deleted || post.hiddenAt || post.postType === "mail_day") continue;
    if (listedPosts.has(post.authorId)) continue;
    bump(postCount, post.authorId);
  }
  const blocks = new Set<string>();
  for (const pair of input.blockPairs) {
    if (!pair.blockerId || !pair.blockedId || pair.blockerId === pair.blockedId) continue;
    blocks.add(pairKey(pair.blockerId, pair.blockedId));
  }
  return { profiles, cardCount, postCount, publicCards, blocks };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function blockedPair(index: ActorIndex, a: string, b: string): boolean {
  return index.blocks.has(pairKey(a, b));
}

export function isTestProfile(profile: BoardProfile): boolean {
  return profile.isTest || isTestAccount(profile.username);
}

export function actorQualifies(index: ActorIndex, actorId: string, actionAt: string): boolean {
  const profile = index.profiles.get(actorId);
  if (!profile || isTestProfile(profile)) return false;
  const acted = Date.parse(actionAt);
  const created = Date.parse(profile.createdAt);
  if (!Number.isFinite(acted) || !Number.isFinite(created)) return false;
  if (acted - created < ACTOR_MIN_AGE_DAYS * DAY_MS) return false;
  const cards = index.cardCount.get(actorId) ?? 0;
  const posts = index.postCount.get(actorId) ?? 0;
  return cards >= ACTOR_MIN_CONTENT || posts >= ACTOR_MIN_CONTENT;
}

function entrantOk(index: ActorIndex, userId: string): BoardProfile | null {
  const profile = index.profiles.get(userId);
  if (!profile || isTestProfile(profile)) return null;
  return profile;
}

export function isOfficialEntrant(profile: BoardProfile): boolean {
  if (isOfficialUpdatesAccount(profile.id)) return true;
  return normalizeAccountHandle(profile.username) === OFFICIAL_UPDATES_HANDLE;
}

function handleOf(profile: BoardProfile): string {
  const name = profile.username.trim().replace(/^@/, "");
  return name ? `@${name}` : "";
}

function profileHref(profile: BoardProfile): string {
  const name = profile.username.trim().replace(/^@/, "");
  return name ? userHref(name) : "/leaderboard";
}

function addPoints(bucket: Map<string, number>, actorId: string, points: number) {
  bucket.set(actorId, (bucket.get(actorId) ?? 0) + points);
}

function contributionsFrom(bucket: Map<string, number>): Contribution[] {
  const rows: Contribution[] = [];
  for (const [actorId, points] of bucket) {
    if (points !== 0) rows.push({ actorId, points });
  }
  return rows;
}

function postQualifies(post: BoardPost, index: ActorIndex, week: WeekWindow): BoardCard | null {
  if (post.deleted || post.hiddenAt || post.postType === "mail_day") return null;
  if (!post.createdAt || !inWeek(new Date(post.createdAt), week)) return null;
  for (const cardId of post.cardIds) {
    const card = index.publicCards.get(cardId);
    if (card) return card;
  }
  return null;
}

function scorePosts(input: ScoreInput, week: WeekWindow, index: ActorIndex): CandidateRow[] {
  const posts = new Map(input.posts.map((post) => [post.id, post]));
  const actors = new Map<string, Set<string>>();
  const note = (postId: string, actorId: string) => {
    let set = actors.get(postId);
    if (!set) {
      set = new Set();
      actors.set(postId, set);
    }
    set.add(actorId);
  };

  // Likes are whatever the caller supplied. Production passes getPostLikeActors(), which is empty.
  for (const like of input.likes) {
    if (like.undone || !like.actorId || !like.postId) continue;
    if (!inWeek(new Date(like.createdAt), week)) continue;
    const post = posts.get(like.postId);
    if (!post || like.actorId === post.authorId) continue;
    if (blockedPair(index, like.actorId, post.authorId)) continue;
    if (!postQualifies(post, index, week)) continue;
    if (!actorQualifies(index, like.actorId, like.createdAt)) continue;
    note(post.id, like.actorId);
  }

  for (const reply of input.replies) {
    if (reply.undone || reply.hidden || reply.deleted || !reply.actorId || !reply.postId) continue;
    if (!inWeek(new Date(reply.createdAt), week)) continue;
    const post = posts.get(reply.postId);
    if (!post || reply.actorId === post.authorId) continue;
    if (blockedPair(index, reply.actorId, post.authorId)) continue;
    if (!postQualifies(post, index, week)) continue;
    if (!actorQualifies(index, reply.actorId, reply.createdAt)) continue;
    note(post.id, reply.actorId);
  }

  const rows: CandidateRow[] = [];
  for (const [postId, set] of actors) {
    const post = posts.get(postId);
    if (!post) continue;
    const author = entrantOk(index, post.authorId);
    if (!author || isOfficialEntrant(author)) continue;
    const card = postQualifies(post, index, week);
    if (!card) continue;
    const list = [...set].map((actorId) => ({ actorId, points: 1 }));
    if (list.length === 0) continue;
    const player = card.player.trim();
    const body = post.body.trim().replace(/\s+/g, " ");
    rows.push({
      id: post.id,
      userId: author.id,
      title: player || (body ? body.slice(0, 80) : "Card post"),
      subtitle: handleOf(author),
      href: `/posts/${post.id}`,
      avatarUrl: author.avatarUrl,
      accent: author.accent || "#7c5cff",
      contributions: list,
    });
  }
  return rows;
}

function followDelta(follow: BoardFollow, week: WeekWindow): number {
  const created = Date.parse(follow.createdAt);
  if (!Number.isFinite(created)) return 0;
  const removed = follow.removedAt ? Date.parse(follow.removedAt) : NaN;
  if (Number.isFinite(removed) && removed <= created) return 0;
  let delta = 0;
  if (inWeek(new Date(created), week)) delta += 1;
  if (Number.isFinite(removed) && inWeek(new Date(removed), week)) delta -= 1;
  return delta;
}

function dedupedFollows(follows: readonly BoardFollow[]): BoardFollow[] {
  const seen = new Set<string>();
  const rows: BoardFollow[] = [];
  for (const follow of follows) {
    const key = `${follow.followerId}|${follow.followingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(follow);
  }
  return rows;
}

function scoreRising(input: ScoreInput, week: WeekWindow, index: ActorIndex): CandidateRow[] {
  const points = new Map<string, Map<string, number>>();
  for (const follow of dedupedFollows(input.follows)) {
    if (!follow.followerId || !follow.followingId) continue;
    if (follow.followerId === follow.followingId) continue;
    if (blockedPair(index, follow.followerId, follow.followingId)) continue;
    const delta = followDelta(follow, week);
    if (delta === 0) continue;
    const when = delta > 0 ? follow.createdAt : (follow.removedAt ?? follow.createdAt);
    if (!actorQualifies(index, follow.followerId, when)) continue;
    const entrant = entrantOk(index, follow.followingId);
    if (!entrant || isOfficialEntrant(entrant)) continue;
    let bucket = points.get(follow.followingId);
    if (!bucket) {
      bucket = new Map();
      points.set(follow.followingId, bucket);
    }
    addPoints(bucket, follow.followerId, delta);
  }

  const rows: CandidateRow[] = [];
  for (const [userId, bucket] of points) {
    const profile = entrantOk(index, userId);
    if (!profile || isOfficialEntrant(profile)) continue;
    const list = contributionsFrom(bucket);
    if (list.length === 0) continue;
    const name = profile.displayName.trim() || profile.username;
    rows.push({
      id: profile.id,
      userId: profile.id,
      title: name,
      subtitle: handleOf(profile),
      href: profileHref(profile),
      avatarUrl: profile.avatarUrl,
      accent: profile.accent || "#7c5cff",
      contributions: list,
    });
  }
  return rows;
}

export function normLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Pathname of a card photo that counts, or null. Dedupe uses this pathname. */
export function realPhoto(url: string | null, userId: string): string | null {
  const owner = userId.trim();
  const raw = url?.trim() ?? "";
  if (!raw || !owner) return null;
  const lowered = raw.toLowerCase();
  if (lowered.includes("..") || lowered.includes("%2e") || lowered.includes("%2f") || lowered.includes("%25")) {
    return null;
  }
  let origin: string;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()).origin;
  } catch {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.origin !== origin || parsed.search || parsed.hash) return null;
  const prefix = `/storage/v1/object/public/card-photos/${owner}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  return parsed.pathname;
}

export function parallelKey(value: string): string {
  const label = normLabel(value);
  if (label === "" || label === "base") return "base";
  return label;
}

export function cardIdentity(card: BoardCard): string {
  return [normLabel(card.player), String(card.year), normLabel(card.setName), parallelKey(card.parallel)].join("\0");
}

export function cardDay(createdAt: string): string {
  const parts = zonedParts(new Date(createdAt));
  return isoDate(parts.year, parts.month, parts.day);
}

function scoreCards(input: ScoreInput, week: WeekWindow, index: ActorIndex): CandidateRow[] {
  const byUser = new Map<string, BoardCard[]>();
  for (const card of input.cards) {
    if (!card.userId || card.id.startsWith("exists:")) continue;
    // Private cards count too. The board only shows the collector's name and count.
    if (card.hidden || card.deleted) continue;
    if (!realPhoto(card.imageUrl, card.userId)) continue;
    const createdMs = Date.parse(card.createdAt);
    if (!card.createdAt || !Number.isFinite(createdMs) || createdMs > input.now.getTime()) continue;
    if (!inWeek(new Date(createdMs), week)) continue;
    if (!actorQualifies(index, card.userId, card.createdAt)) continue;
    const profile = entrantOk(index, card.userId);
    if (!profile || isOfficialEntrant(profile)) continue;
    const list = byUser.get(card.userId) ?? [];
    list.push(card);
    byUser.set(card.userId, list);
  }

  const rows: CandidateRow[] = [];
  for (const [userId, list] of byUser) {
    const profile = index.profiles.get(userId);
    if (!profile) continue;
    const ordered = [...list].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    const seen = new Set<string>();
    const seenPhotos = new Set<string>();
    const perDay = new Map<string, number>();
    let count = 0;
    for (const card of ordered) {
      const photo = realPhoto(card.imageUrl, card.userId);
      if (!photo || seenPhotos.has(photo)) continue;
      const key = cardIdentity(card);
      if (seen.has(key)) continue;
      const day = cardDay(card.createdAt);
      const used = perDay.get(day) ?? 0;
      if (used >= DAILY_CARD_CAP) continue;
      seenPhotos.add(photo);
      seen.add(key);
      perDay.set(day, used + 1);
      count += 1;
    }
    if (count === 0) continue;
    const name = profile.displayName.trim() || profile.username;
    rows.push({
      id: profile.id,
      userId: profile.id,
      title: name,
      subtitle: handleOf(profile),
      href: profileHref(profile),
      avatarUrl: profile.avatarUrl,
      accent: profile.accent || "#2dd4bf",
      contributions: [{ actorId: userId, points: count }],
    });
  }
  return rows;
}

/** Qualified rows for one week. Scores are summed later, after the viewer filter. */
export function buildWeekBoards(input: ScoreInput, week: WeekWindow): WeekBoards {
  const index = indexInput(input);
  return {
    "top-card-post": { rows: scorePosts(input, week, index) },
    "rising-collectors": { rows: scoreRising(input, week, index) },
    "most-cards-added": { rows: scoreCards(input, week, index) },
  };
}
