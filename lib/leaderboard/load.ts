import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { pct, signedMoney } from "@/lib/format";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { leaderboardBadgeChips } from "./badges";
import { withoutBlocked } from "./blocks";
import { formatSnapshotDate, isNewYorkMonday, leaderboardDates } from "./dates";
import {
  LEADERBOARD_CLOSED_COPY,
  LEADERBOARD_MIN_COLLECTORS,
  LEADERBOARD_NOTE,
  leaderboardMinimums,
  leaderboardOpens,
} from "./eligibility";
import { rankLeaderboard } from "./math";
import type { LeaderboardEntry, LeaderboardModel, LeaderboardWindow } from "./types";

export const LEADERBOARD_CACHE_SECONDS = 15 * 60;
export type { LeaderboardEntry, LeaderboardModel, LeaderboardWindow };

type RawRow = {
  user_id?: unknown;
  username?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  accent?: unknown;
  prior_sum?: unknown;
  today_sum?: unknown;
  card_count?: unknown;
};

type PublicWindow = {
  qualifying: number;
  rows: LeaderboardEntry[];
};

type PublicBoard = {
  today: string;
  day: PublicWindow;
  week: PublicWindow;
};

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function reader(): SupabaseClient | null {
  const admin = createSupabaseAdmin();
  if (admin) return admin;
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toEntry(row: RawRow): LeaderboardEntry | null {
  const userId = text(row.user_id);
  const username = text(row.username).trim();
  const prior = numeric(row.prior_sum);
  const today = numeric(row.today_sum);
  const cardCount = numeric(row.card_count);
  if (!userId || !username || prior == null || today == null || prior <= 0) return null;
  const delta = today - prior;
  const percent = delta / prior;
  const count = cardCount == null ? 0 : Math.max(0, Math.round(cardCount));
  return {
    userId,
    username,
    displayName: text(row.display_name) || username,
    avatarUrl: text(row.avatar_url) || null,
    accent: text(row.accent) || "#7c5cff",
    percent,
    delta,
    cardCount: count,
    percentLabel: pct(percent),
    deltaLabel: signedMoney(delta),
  };
}

async function fetchWindow(
  client: SupabaseClient,
  today: string,
  prior: string,
  minCards: number,
  minValue: number,
): Promise<PublicWindow> {
  const { data, error } = await client.rpc("leaderboard_rows", {
    p_today: today,
    p_prior: prior,
    p_min_cards: minCards,
    p_min_value: minValue,
  });
  if (error) throw new Error(error.message);
  const rows: LeaderboardEntry[] = [];
  for (const row of (data ?? []) as RawRow[]) {
    const entry = toEntry(row);
    if (entry) rows.push(entry);
  }
  return { qualifying: rows.length, rows };
}

async function readPublicBoard(): Promise<PublicBoard> {
  const client = reader();
  const dates = leaderboardDates();
  if (!client) {
    return {
      today: dates.today,
      day: { qualifying: 0, rows: [] },
      week: { qualifying: 0, rows: [] },
    };
  }
  const minimums = leaderboardMinimums();
  const [day, week] = await Promise.all([
    fetchWindow(client, dates.today, dates.yesterday, minimums.minCards, minimums.minValue),
    fetchWindow(client, dates.today, dates.weekAgo, minimums.minCards, minimums.minValue),
  ]);
  return { today: dates.today, day, week };
}

export async function getPublicLeaderboard(): Promise<PublicBoard> {
  try {
    return await unstable_cache(readPublicBoard, ["leaderboard-public"], {
      revalidate: LEADERBOARD_CACHE_SECONDS,
    })();
  } catch (error) {
    console.error("[leaderboard] read failed", error instanceof Error ? error.message : "error");
    const dates = leaderboardDates();
    return {
      today: dates.today,
      day: { qualifying: 0, rows: [] },
      week: { qualifying: 0, rows: [] },
    };
  }
}

async function hiddenIds(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const supabase = await createSupabaseServer();
  if (!supabase) return new Set();
  const { data, error } = await supabase.rpc("hidden_author_ids", { apply_mute: false });
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.filter((id): id is string => typeof id === "string" && id.length > 0));
}

function presentWindow(window: PublicWindow, hidden: ReadonlySet<string>): LeaderboardWindow {
  const open = leaderboardOpens(window.qualifying, LEADERBOARD_MIN_COLLECTORS);
  if (!open) {
    return { open: false, rows: [], message: LEADERBOARD_CLOSED_COPY };
  }
  return {
    open: true,
    rows: withoutBlocked(window.rows, hidden),
    message: null,
  };
}

export async function getLeaderboard(now: Date = new Date()): Promise<LeaderboardModel> {
  const viewerUserId = await getAuthUserId();
  const [board, hidden] = await Promise.all([getPublicLeaderboard(), hiddenIds(viewerUserId)]);
  return {
    today: board.today,
    dateLabel: formatSnapshotDate(board.today),
    monday: isNewYorkMonday(now),
    note: LEADERBOARD_NOTE,
    day: presentWindow(board.day, hidden),
    week: presentWindow(board.week, hidden),
    viewerUserId,
  };
}

export async function leaderboardChipsFor(input: {
  userId?: string | null;
  username?: string | null;
}): Promise<string[]> {
  const wantedId = input.userId ?? null;
  const wantedHandle = input.username?.trim().toLowerCase() ?? "";
  if (!wantedId && !wantedHandle) return [];
  try {
    const board = await getLeaderboard();
    const day = board.day.open ? rankLeaderboard(board.day.rows, "gainers") : [];
    const week = board.week.open ? rankLeaderboard(board.week.rows, "gainers") : [];
    const match = (rows: readonly { userId: string; username: string; rank: number }[]) =>
      rows.find((row) =>
        wantedId ? row.userId === wantedId : row.username.toLowerCase() === wantedHandle,
      );
    const subject = match(day) ?? match(week);
    if (!subject) return [];
    return leaderboardBadgeChips({
      userId: subject.userId,
      day,
      week,
      monday: board.monday,
      dateLabel: board.dateLabel,
      hidden: false,
    });
  } catch {
    return [];
  }
}
