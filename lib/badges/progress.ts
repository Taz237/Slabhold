import { DAILY_CARD_CAP } from "@/lib/leaderboard/rules";
import {
  actorQualifies,
  blockedPair,
  cardDay,
  cardIdentity,
  indexInput,
  isOfficialEntrant,
  isTestProfile,
  normLabel,
  parallelKey,
  realPhoto,
  type ActorIndex,
  type BlockPair,
  type BoardCard,
  type BoardFollow,
  type BoardPost,
  type BoardProfile,
  type BoardReply,
} from "@/lib/leaderboard/score";
import { addCalendarDays, weekContaining } from "@/lib/leaderboard/week";
import {
  BADGE_THRESHOLDS,
  BADGE_TIERS,
  CATEGORY_COPY,
  PROGRESS_CATEGORIES,
  TIER_LABELS,
  tierRank,
  type BadgeCategory,
  type BadgeTier,
  type ProgressCategory,
} from "./config";

export type BadgeCard = BoardCard & { graded: boolean };

/** One user's rows. Replies are on this user's posts; followers follow this user. */
export type BadgeInput = {
  user: BoardProfile;
  cards: readonly BadgeCard[];
  posts: readonly BoardPost[];
  replies: readonly BoardReply[];
  followers: readonly BoardFollow[];
  /** Profiles of the repliers and followers. */
  actors: readonly BoardProfile[];
  /** Actors with at least one card. */
  actorsWithCard: readonly string[];
  /** Actors with at least one visible, non-Mail-Day post. */
  actorsWithPost: readonly string[];
  blockPairs: readonly BlockPair[];
  /** Week start dates (YYYY-MM-DD) this user finished top 3 on any board. */
  podiumWeeks: readonly string[];
  now: Date;
};

/** Values for each category. Streak is the longest run; streakCurrent is the live one. */
export type BadgeCounts = Record<ProgressCategory, number> & { streakCurrent: number };

export type EarnedBadge = { category: BadgeCategory; tier: BadgeTier };

/** Test and official accounts never earn badges. */
export function badgeEligible(user: BoardProfile): boolean {
  return !isTestProfile(user) && !isOfficialEntrant(user);
}

function actorIndex(input: BadgeInput): ActorIndex {
  const placeholder = (userId: string): BoardCard => ({
    id: `exists:${userId}`,
    userId,
    isPublic: false,
    player: "",
    year: 0,
    setName: "",
    parallel: "",
    imageUrl: null,
    createdAt: "",
    hidden: false,
    deleted: false,
  });
  return indexInput({
    profiles: [input.user, ...input.actors],
    posts: [],
    cards: input.actorsWithCard.map(placeholder),
    usersWithPost: input.actorsWithPost,
    likes: [],
    replies: [],
    follows: [],
    blockPairs: input.blockPairs,
    now: input.now,
  });
}

/** Same rules as Most cards added: real photo, one per identity and photo, daily cap. */
function countedCards(cards: readonly BadgeCard[], userId: string, now: Date): BadgeCard[] {
  const ordered = cards
    .filter((card) => {
      if (card.userId !== userId || card.hidden || card.deleted) return false;
      const created = Date.parse(card.createdAt);
      return Number.isFinite(created) && created <= now.getTime();
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const seenPhotos = new Set<string>();
  const perDay = new Map<string, number>();
  const kept: BadgeCard[] = [];
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
    kept.push(card);
  }
  return kept;
}

/** Collector count alone, for the first-badge line. */
export function collectorCount(cards: readonly BadgeCard[], userId: string, now: Date): number {
  return countedCards(cards, userId, now).length;
}

function bestRainbow(cards: readonly BadgeCard[]): number {
  const byPlayer = new Map<string, Set<string>>();
  for (const card of cards) {
    const player = normLabel(card.player);
    const parallel = parallelKey(card.parallel);
    if (!player || parallel === "base") continue;
    const set = byPlayer.get(player) ?? new Set<string>();
    set.add(parallel);
    byPlayer.set(player, set);
  }
  let best = 0;
  for (const set of byPlayer.values()) best = Math.max(best, set.size);
  return best;
}

function visiblePost(post: BoardPost): boolean {
  return !post.deleted && !post.hiddenAt && post.postType !== "mail_day";
}

function repliedPosts(input: BadgeInput, index: ActorIndex): number {
  const mine = new Map<string, BoardPost>();
  for (const post of input.posts) {
    if (post.authorId === input.user.id && visiblePost(post)) mine.set(post.id, post);
  }
  const counted = new Set<string>();
  for (const reply of input.replies) {
    if (reply.undone || reply.hidden || reply.deleted || !reply.actorId) continue;
    const post = mine.get(reply.postId);
    if (!post || counted.has(post.id) || reply.actorId === post.authorId) continue;
    if (blockedPair(index, reply.actorId, post.authorId)) continue;
    if (!actorQualifies(index, reply.actorId, reply.createdAt)) continue;
    counted.add(post.id);
  }
  return counted.size;
}

function realFollowers(input: BadgeInput, index: ActorIndex): number {
  const counted = new Set<string>();
  for (const follow of input.followers) {
    const followerId = follow.followerId;
    if (!followerId || follow.followingId !== input.user.id || followerId === input.user.id) continue;
    if (follow.removedAt || counted.has(followerId)) continue;
    if (blockedPair(index, followerId, input.user.id)) continue;
    if (!actorQualifies(index, followerId, follow.createdAt)) continue;
    counted.add(followerId);
  }
  return counted.size;
}

function weekStart(instant: string): string | null {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  return weekContaining(new Date(ms)).startDate;
}

function streaks(activity: readonly string[], now: Date): { longest: number; current: number } {
  const weeks = new Set<string>();
  for (const instant of activity) {
    if (Date.parse(instant) > now.getTime()) continue;
    const start = weekStart(instant);
    if (start) weeks.add(start);
  }
  let longest = 0;
  for (const start of weeks) {
    if (weeks.has(addCalendarDays(start, -7))) continue;
    let run = 1;
    while (weeks.has(addCalendarDays(start, run * 7))) run += 1;
    longest = Math.max(longest, run);
  }
  // This week can still be filled, so a run that ended last week stays live.
  const thisWeek = weekContaining(now).startDate;
  let cursor = weeks.has(thisWeek) ? thisWeek : addCalendarDays(thisWeek, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current += 1;
    cursor = addCalendarDays(cursor, -7);
  }
  return { longest, current };
}

export function badgeCounts(input: BadgeInput): BadgeCounts {
  const index = actorIndex(input);
  const collected = countedCards(input.cards, input.user.id, input.now);
  const slabs = countedCards(
    input.cards.filter((card) => card.graded),
    input.user.id,
    input.now,
  );
  const activity = [
    ...collected.map((card) => card.createdAt),
    ...input.posts
      .filter((post) => post.authorId === input.user.id && visiblePost(post))
      .map((post) => post.createdAt),
  ];
  const streak = streaks(activity, input.now);
  return {
    collector: collected.length,
    streak: streak.longest,
    streakCurrent: streak.current,
    "rainbow-chaser": bestRainbow(collected),
    "slab-king": slabs.length,
    "voice-of-the-hobby": repliedPosts(input, index),
    following: realFollowers(input, index),
    leaderboard: new Set(input.podiumWeeks.filter(Boolean)).size,
  };
}

export function tierForValue(category: ProgressCategory, value: number): BadgeTier | null {
  let reached: BadgeTier | null = null;
  BADGE_THRESHOLDS[category].forEach((threshold, index) => {
    if (value >= threshold) reached = BADGE_TIERS[index];
  });
  return reached;
}

export function earnedTiers(category: ProgressCategory, value: number): BadgeTier[] {
  const top = tierForValue(category, value);
  if (!top) return [];
  return BADGE_TIERS.slice(0, tierRank(top) + 1);
}

/** Badges the counts reach that are not stored yet. Empty for test and official accounts. */
export function newAwards(
  input: Pick<BadgeInput, "user">,
  counts: BadgeCounts,
  existing: readonly EarnedBadge[],
): EarnedBadge[] {
  if (!badgeEligible(input.user)) return [];
  const have = new Set(existing.map((badge) => `${badge.category}:${badge.tier}`));
  const awards: EarnedBadge[] = [];
  for (const category of PROGRESS_CATEGORIES) {
    for (const tier of earnedTiers(category, counts[category])) {
      if (!have.has(`${category}:${tier}`)) awards.push({ category, tier });
    }
  }
  return awards;
}

/** Highest stored tier in a category. Stored badges never go away. */
export function highestEarned(category: BadgeCategory, earned: readonly EarnedBadge[]): BadgeTier | null {
  let best: BadgeTier | null = null;
  for (const badge of earned) {
    if (badge.category !== category) continue;
    if (!best || tierRank(badge.tier) > tierRank(best)) best = badge.tier;
  }
  return best;
}

function nextTierAfter(tier: BadgeTier | null): BadgeTier | null {
  if (!tier) return BADGE_TIERS[0];
  return BADGE_TIERS[tierRank(tier) + 1] ?? null;
}

export function progressLine(category: ProgressCategory, value: number, earned: BadgeTier | null): string {
  const next = nextTierAfter(earned);
  if (!next) return "All tiers unlocked";
  const target = BADGE_THRESHOLDS[category][tierRank(next)];
  const copy = CATEGORY_COPY[category];
  const unit = target === 1 ? copy.unitOne : copy.unit;
  return `${Math.min(value, target)} / ${target} ${unit} to ${TIER_LABELS[next]}`;
}

export type CategoryStatus = {
  category: ProgressCategory;
  value: number;
  earned: BadgeTier | null;
  next: BadgeTier | null;
  target: number | null;
  /** 0 to 1 toward the next tier. */
  progress: number;
  line: string;
};

export function categoryStatus(
  category: ProgressCategory,
  value: number,
  earned: readonly EarnedBadge[],
): CategoryStatus {
  const stored = highestEarned(category, earned);
  const computed = tierForValue(category, value);
  const top =
    stored && computed ? (tierRank(stored) >= tierRank(computed) ? stored : computed) : (stored ?? computed);
  const next = nextTierAfter(top);
  const target = next ? BADGE_THRESHOLDS[category][tierRank(next)] : null;
  return {
    category,
    value,
    earned: top,
    next,
    target,
    progress: target ? Math.max(0, Math.min(1, value / target)) : 1,
    line: progressLine(category, value, top),
  };
}

/** The value shown toward the next tier. Streak shows the live run. */
export function displayValue(category: ProgressCategory, counts: BadgeCounts): number {
  return category === "streak" ? counts.streakCurrent : counts[category];
}
