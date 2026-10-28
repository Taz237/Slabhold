import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaderboardSnapshot, rowsIn, usersWithACard } from "@/lib/leaderboard/load";
import { pageRows, type PageAdmin } from "@/lib/leaderboard/pages";
import type { BlockPair, BoardFollow, BoardPost, BoardProfile, BoardReply } from "@/lib/leaderboard/score";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizeUsername } from "@/lib/social/local-db";
import { PROGRESS_CATEGORIES, isBadgeCategory, isBadgeTier, TOTAL_BADGES } from "./config";
import { upgradePins } from "./pins";
import { readVisiblePins } from "./visible-pins";
import { closedPodiums } from "./podium";
import {
  badgeCounts,
  badgeEligible,
  categoryStatus,
  collectorCount,
  displayValue,
  newAwards,
  type BadgeCard,
  type BadgeCounts,
  type BadgeInput,
  type CategoryStatus,
  type EarnedBadge,
} from "./progress";
import { revealFor, type BadgeReveal, type UnseenBadge } from "./reveal";
import { profileBadges, type ProfileBadges } from "./visibility";

export type { ProfileBadges };

type Row = Record<string, unknown>;

export type StoredBadge = EarnedBadge & { id: string; earnedAt: string; seenAt: string | null };

export type BadgeState = {
  /** The owner's handle, for share links. */
  username: string;
  eligible: boolean;
  counts: BadgeCounts;
  earned: StoredBadge[];
  statuses: CategoryStatus[];
  showBadges: boolean;
  pinned: string[];
  earnedCount: number;
  total: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

function pinsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toProfile(row: Row): BoardProfile {
  return {
    id: text(row.id),
    username: text(row.username),
    displayName: text(row.display_name),
    createdAt: text(row.created_at),
    isTest: row.is_test === true,
    avatarUrl: null,
    accent: "#7c5cff",
  };
}

function toBadge(row: Row): StoredBadge | null {
  const category = row.category;
  const tier = row.tier;
  if (!isBadgeCategory(category) || !isBadgeTier(tier)) return null;
  return {
    id: text(row.id),
    category,
    tier,
    earnedAt: text(row.earned_at),
    seenAt: text(row.seen_at) || null,
  };
}

function toCard(row: Row): BadgeCard | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  if (!id || !userId) return null;
  const year = typeof row.year === "number" ? row.year : Number(row.year);
  return {
    id,
    userId,
    isPublic: row.is_public === true,
    player: text(row.player),
    year: Number.isFinite(year) ? year : 0,
    setName: text(row.set),
    parallel: text(row.parallel),
    imageUrl: text(row.image_url) || null,
    createdAt: text(row.created_at),
    hidden: false,
    deleted: false,
    graded: text(row.condition_type) === "graded",
  };
}

const CARD_COLUMNS = "id, user_id, player, year, set, parallel, image_url, is_public, created_at, condition_type";

async function readCards(admin: PageAdmin, userId: string): Promise<BadgeCard[]> {
  const rows = await pageRows(admin, "cards", CARD_COLUMNS, ["created_at", "id"], (query) =>
    query.eq("user_id", userId),
  );
  return rows.flatMap((row) => toCard(row) ?? []);
}

async function readInput(admin: PageAdmin, user: BoardProfile, now: Date): Promise<BadgeInput> {
  const userId = user.id;
  const [cards, postRows, followRows, blockedByMe, blockingMe, podiumRows] = await Promise.all([
    readCards(admin, userId),
    pageRows(admin, "posts", "id, user_id, post_type, hidden_at, created_at", ["id"], (query) =>
      query.eq("user_id", userId),
    ),
    pageRows(admin, "follows", "follower_id, following_id, created_at", ["follower_id"], (query) =>
      query.eq("following_id", userId),
    ),
    pageRows(admin, "blocks", "blocked_id", ["blocked_id"], (query) => query.eq("blocker_id", userId)),
    pageRows(admin, "blocks", "blocker_id", ["blocker_id"], (query) => query.eq("blocked_id", userId)),
    pageRows(admin, "leaderboard_podiums", "week_start, board_id", ["week_start", "board_id"], (query) =>
      query.eq("user_id", userId),
    ),
  ]);

  const posts: BoardPost[] = postRows.flatMap((row) => {
    const id = text(row.id);
    if (!id) return [];
    return [
      {
        id,
        authorId: userId,
        body: "",
        hiddenAt: text(row.hidden_at) || null,
        deleted: false,
        cardIds: [],
        postType: text(row.post_type) === "mail_day" ? "mail_day" : "post",
        createdAt: text(row.created_at),
      },
    ];
  });

  const replyRows = await rowsIn(
    admin,
    "comments",
    "id, user_id, post_id, created_at",
    "post_id",
    posts.map((post) => post.id),
    "id",
  );
  const replies: BoardReply[] = replyRows.flatMap((row) => {
    const actorId = text(row.user_id);
    const postId = text(row.post_id);
    const createdAt = text(row.created_at);
    if (!actorId || !postId || !createdAt) return [];
    return [{ id: text(row.id), actorId, postId, createdAt, undone: false, hidden: false, deleted: false }];
  });

  const followers: BoardFollow[] = followRows.flatMap((row) => {
    const followerId = text(row.follower_id);
    const createdAt = text(row.created_at);
    if (!followerId || !createdAt) return [];
    return [{ followerId, followingId: userId, createdAt, removedAt: null }];
  });

  const blockPairs: BlockPair[] = [
    ...blockedByMe.map((row) => ({ blockerId: userId, blockedId: text(row.blocked_id) })),
    ...blockingMe.map((row) => ({ blockerId: text(row.blocker_id), blockedId: userId })),
  ];

  const actorIds = [
    ...new Set([...replies.map((reply) => reply.actorId), ...followers.map((row) => row.followerId)]),
  ].filter((id) => id && id !== userId);
  const [actorRows, actorsWithCard] = await Promise.all([
    rowsIn(admin, "profiles", "id, username, display_name, created_at, is_test", "id", actorIds),
    usersWithACard(admin, actorIds),
  ]);
  // Only actors with no card need a post to qualify.
  const withCard = new Set(actorsWithCard);
  const actorPostRows = await rowsIn(
    admin,
    "posts",
    "id, user_id, post_type, hidden_at",
    "user_id",
    actorIds.filter((id) => !withCard.has(id)),
    "id",
  );
  const actorsWithPost = new Set<string>();
  for (const row of actorPostRows) {
    if (text(row.hidden_at) || text(row.post_type) === "mail_day") continue;
    const id = text(row.user_id);
    if (id) actorsWithPost.add(id);
  }

  return {
    user,
    cards,
    posts,
    replies,
    followers,
    actors: actorRows.map(toProfile),
    actorsWithCard,
    actorsWithPost: [...actorsWithPost],
    blockPairs,
    podiumWeeks: podiumRows.map((row) => text(row.week_start)),
    now,
  };
}

let recordedWeek = "";

/**
 * Top 3 of the last closed week, from a snapshot scored after the close. A
 * cached snapshot from before finalAt records nothing; a later call records
 * once the cache refreshes. Runs on badge checks and leaderboard opens.
 * Idempotent; one write per instance per week. Never throws.
 */
export async function recordClosedPodiums(now = new Date()): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;
  try {
    const finishes = closedPodiums(await getLeaderboardSnapshot(now));
    const week = finishes[0]?.weekStart ?? "";
    if (!week || week === recordedWeek) return;
    const { error } = await admin.from("leaderboard_podiums").upsert(
      finishes.map((row) => ({ week_start: row.weekStart, board_id: row.boardId, user_id: row.userId, rank: row.rank })),
      { onConflict: "week_start,board_id,user_id", ignoreDuplicates: true },
    );
    if (!error) recordedWeek = week;
  } catch {
    // The next badge check or leaderboard open tries again.
  }
}

async function readProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, display_name, created_at, is_test, show_badges, pinned_badges")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Row;
}

async function readEarned(admin: SupabaseClient, userId: string): Promise<StoredBadge[] | null> {
  const { data, error } = await admin
    .from("user_badges")
    .select("id, category, tier, earned_at, seen_at")
    .eq("user_id", userId)
    .order("earned_at");
  if (error) return null;
  return asRows(data).flatMap((row) => toBadge(row) ?? []);
}

/** Move saved pins up to the highest earned tier, so the stored pins match what profiles show. */
async function saveUpgradedPins(
  admin: SupabaseClient,
  userId: string,
  saved: string[],
  earned: readonly EarnedBadge[],
): Promise<string[]> {
  const upgraded = upgradePins(saved, earned);
  if (upgraded.join(",") === saved.join(",")) return saved;
  const { error } = await admin.from("profiles").update({ pinned_badges: upgraded }).eq("id", userId);
  return error ? saved : upgraded;
}

/**
 * Check one user's progress and store any new badges. Returns null when the
 * database or the badges migration is not available.
 */
export async function checkBadges(userId: string, now = new Date()): Promise<BadgeState | null> {
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return null;
  try {
    const profileRow = await readProfile(admin, userId);
    if (!profileRow) return null;
    await recordClosedPodiums(now);
    const user = toProfile(profileRow);
    const [input, stored] = await Promise.all([
      readInput(admin as unknown as PageAdmin, user, now),
      readEarned(admin, userId),
    ]);
    if (!stored) return null;
    const counts = badgeCounts(input);
    const awards = newAwards(input, counts, stored);
    let earned = stored;
    if (awards.length > 0) {
      const { error } = await admin
        .from("user_badges")
        .upsert(
          awards.map((badge) => ({ user_id: userId, category: badge.category, tier: badge.tier })),
          { onConflict: "user_id,category,tier", ignoreDuplicates: true },
        );
      if (!error) earned = (await readEarned(admin, userId)) ?? stored;
    }
    const pinned = await saveUpgradedPins(admin, userId, pinsFrom(profileRow.pinned_badges), earned);
    return {
      username: text(profileRow.username),
      eligible: badgeEligible(user),
      counts,
      earned,
      statuses: PROGRESS_CATEGORIES.map((category) =>
        categoryStatus(category, displayValue(category, counts), earned),
      ),
      showBadges: profileRow.show_badges !== false,
      pinned,
      earnedCount: earned.length,
      total: TOTAL_BADGES,
    };
  } catch {
    return null;
  }
}

export function unseenReveal(state: BadgeState): BadgeReveal | null {
  const unseen: UnseenBadge[] = state.earned
    .filter((badge) => !badge.seenAt)
    .map((badge) => ({ id: badge.id, category: badge.category, tier: badge.tier }));
  return revealFor(unseen, state.counts);
}

/**
 * Badges for a profile, read as the viewer so show_badges is enforced by RLS.
 * The owner's first-badge line reads only their cards.
 */
export async function loadProfileBadges(
  target: { username: string } | { own: true },
  viewerId: string | null,
): Promise<ProfileBadges | null> {
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  try {
    let query = supabase.from("profiles").select("id, username, show_badges");
    if ("own" in target) {
      if (!viewerId) return null;
      query = query.eq("id", viewerId);
    } else {
      const normalized = normalizeUsername(target.username);
      if (!normalized) return null;
      query = query.eq("username", normalized);
    }
    const { data: profile, error } = await query.maybeSingle();
    if (error || !profile) return null;
    const ownerId = text(profile.id);
    const showBadges = profile.show_badges !== false;
    const pinned = await readVisiblePins(supabase, ownerId);
    let earned: EarnedBadge[] = [];
    if (showBadges || viewerId === ownerId) {
      const { data, error: badgeError } = await supabase
        .from("user_badges")
        .select("id, category, tier, earned_at, seen_at")
        .eq("user_id", ownerId)
        .order("earned_at");
      if (badgeError) return null;
      earned = asRows(data).flatMap((row) => {
        const badge = toBadge(row);
        return badge ? [{ category: badge.category, tier: badge.tier }] : [];
      });
    }
    let firstGoal: { value: number } | null = null;
    if (viewerId && viewerId === ownerId && showBadges && earned.length === 0) {
      const admin = createSupabaseAdmin();
      if (admin) {
        const cards = await readCards(admin as unknown as PageAdmin, ownerId);
        firstGoal = { value: collectorCount(cards, ownerId, new Date()) };
      }
    }
    return profileBadges({
      username: text(profile.username),
      ownerId,
      viewerId,
      showBadges,
      earned,
      pinned,
      firstGoal,
    });
  } catch {
    return null;
  }
}
