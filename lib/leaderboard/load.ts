import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { assembleValueBoard, type AssembledBracket, type ValueBoardSourceCard } from "./assemble";
import { valueBracketId, type ValueBracketId } from "./brackets";
import { withoutBlocked } from "./blocks";
import { currentValueWeek, formatWeekLabel } from "./dates";
import { LEADERBOARD_CLOSED_COPY, LEADERBOARD_NOTE, leaderboardMinimums } from "./eligibility";
import type { ValueBoardModel, ValueBracketBoard } from "./types";

export const LEADERBOARD_CACHE_SECONDS = 15 * 60;
export type { ValueBoardModel, ValueBoardRow, ValueBracketBoard } from "./types";

type RawCard = {
  user_id?: unknown;
  username?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  accent?: unknown;
  bracket?: unknown;
  card_id?: unknown;
  start_median?: unknown;
  end_median?: unknown;
  start_n_sales?: unknown;
  end_n_sales?: unknown;
  self_reported?: unknown;
  open_flag?: unknown;
};

type PublicValueBoard = {
  start: string;
  end: string;
  brackets: AssembledBracket[];
};

const BRACKET_IDS = new Set<ValueBracketId>(["under-1k", "1k-10k", "10k-plus"]);

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === "t";
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

function ymd(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function toCard(row: RawCard): ValueBoardSourceCard | null {
  const userId = text(row.user_id);
  const username = text(row.username).trim();
  const cardId = text(row.card_id);
  if (!userId || !username || !cardId) return null;
  const bracketText = text(row.bracket);
  const bracket = BRACKET_IDS.has(bracketText as ValueBracketId)
    ? (bracketText as ValueBracketId)
    : valueBracketId(numeric(row.bracket));
  return {
    userId,
    username,
    displayName: text(row.display_name) || username,
    avatarUrl: text(row.avatar_url) || null,
    accent: text(row.accent) || "#7c5cff",
    bracket,
    cardId,
    startMedian: numeric(row.start_median),
    endMedian: numeric(row.end_median),
    startSales: numeric(row.start_n_sales),
    endSales: numeric(row.end_n_sales),
    selfReported: flag(row.self_reported),
    openFlag: flag(row.open_flag),
  };
}

async function readPublicValueBoard(start: string, end: string): Promise<PublicValueBoard> {
  const client = reader();
  if (!client) return { start, end, brackets: [] };
  const minimums = leaderboardMinimums();
  const { data, error } = await client.rpc("leaderboard_rows", {
    p_start: start,
    p_end: end,
    p_min_cards: minimums.minCards,
    p_min_value: minimums.minValue,
    p_min_account_days: minimums.minAccountDays,
    p_as_of: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const cards: ValueBoardSourceCard[] = [];
  for (const row of (data ?? []) as RawCard[]) {
    const card = toCard(row);
    if (card) cards.push(card);
  }
  return { start, end, brackets: assembleValueBoard(cards) };
}

export async function getPublicValueBoard(input?: {
  start?: string;
  end?: string;
  now?: Date;
}): Promise<PublicValueBoard> {
  const week = currentValueWeek(input?.now ?? new Date());
  let start = ymd(input?.start, week.start);
  let end = ymd(input?.end, week.end);
  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  const minimums = leaderboardMinimums();
  try {
    return await unstable_cache(
      () => readPublicValueBoard(start, end),
      [
        "value-board",
        start,
        end,
        String(minimums.minCards),
        String(minimums.minValue),
        String(minimums.minAccountDays),
      ],
      { revalidate: LEADERBOARD_CACHE_SECONDS },
    )();
  } catch (error) {
    console.error("[leaderboard] read failed", error instanceof Error ? error.message : "error");
    return { start, end, brackets: [] };
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

function present(board: PublicValueBoard, hidden: ReadonlySet<string>): {
  closedMessage: string | null;
  emptyMessage: string | null;
  brackets: ValueBracketBoard[];
} {
  const opened = board.brackets.filter((bracket) => bracket.open);
  const visible = opened
    .map((bracket) => ({
      id: bracket.id,
      label: bracket.label,
      rows: withoutBlocked(bracket.rows, hidden),
    }))
    .filter((bracket) => bracket.rows.length > 0);
  if (opened.length === 0) {
    return { closedMessage: LEADERBOARD_CLOSED_COPY, emptyMessage: null, brackets: [] };
  }
  return {
    closedMessage: null,
    emptyMessage: visible.length === 0 ? "No collectors to show." : null,
    brackets: visible,
  };
}

/** Current week by default. Pass start and end to reuse the weekly frame's dates. */
export async function getValueBoard(input?: {
  start?: string;
  end?: string;
  now?: Date;
}): Promise<ValueBoardModel> {
  const viewerUserId = await getAuthUserId();
  const [board, hidden] = await Promise.all([
    getPublicValueBoard(input),
    hiddenIds(viewerUserId),
  ]);
  const view = present(board, hidden);
  return {
    start: board.start,
    end: board.end,
    weekLabel: formatWeekLabel(board.start, board.end),
    note: LEADERBOARD_NOTE,
    closedMessage: view.closedMessage,
    emptyMessage: view.emptyMessage,
    brackets: view.brackets,
    viewerUserId,
  };
}
