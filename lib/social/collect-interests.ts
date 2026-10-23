import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_PICKER_OPTIONS } from "../card-options";
import {
  INTEREST_RANK_LIMIT,
  compactInterest,
  compactPlayerQueryMatches,
  majorityPlayerSpelling,
  normInterest,
  playerSportsCompatible,
  type CollectInterest,
  type InterestKind,
} from "./follow-rank";

/** Sports the onboarding picker never offers. */
const BLOCKED_SPORT = /pok[eé]mon|\btcg\b|magic|yu-?gi-?oh/i;

/** Sports, teams, and players together. Matches the ranking cap. */
export const PICK_LIMIT = INTEREST_RANK_LIMIT;

export const PICK_LIMIT_MESSAGE = `You can pick up to ${PICK_LIMIT}`;

/** False once they already have PICK_LIMIT sports, teams, and players. */
export function canAddPick(currentCount: number): boolean {
  return currentCount < PICK_LIMIT;
}

/**
 * Where Tab should move inside a dialog. Null means the browser can move
 * to the next control. The ends wrap so focus stays in the dialog.
 * Focus outside the list moves to the first item, or the last with Shift.
 */
export function trapTabTarget(count: number, activeIndex: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (activeIndex < 0 || activeIndex >= count) return shift ? count - 1 : 0;
  if (shift && activeIndex <= 0) return count - 1;
  if (!shift && activeIndex >= count - 1) return 0;
  return null;
}

export function interestLimitReached(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return /limited to 50/i.test(error.message ?? "");
}

export const PREFERRED_COLLECT_SPORTS = [
  "Football",
  "Basketball",
  "Baseball",
  "Hockey",
  "Soccer",
] as const;

export type CollectStep = "sports" | "names" | "people";

export type InterestRow = {
  kind: InterestKind | "prompt";
  value: string;
};

export type InterestLoad =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; rows: InterestRow[] };

const TEAM_ROWS: { name: string; sport: string }[] = [
  ["Chiefs", "Football"],
  ["Eagles", "Football"],
  ["Cowboys", "Football"],
  ["49ers", "Football"],
  ["Bills", "Football"],
  ["Ravens", "Football"],
  ["Lions", "Football"],
  ["Packers", "Football"],
  ["Bengals", "Football"],
  ["Dolphins", "Football"],
  ["Jets", "Football"],
  ["Giants", "Football"],
  ["Commanders", "Football"],
  ["Bears", "Football"],
  ["Vikings", "Football"],
  ["Steelers", "Football"],
  ["Browns", "Football"],
  ["Texans", "Football"],
  ["Colts", "Football"],
  ["Jaguars", "Football"],
  ["Titans", "Football"],
  ["Broncos", "Football"],
  ["Raiders", "Football"],
  ["Chargers", "Football"],
  ["Patriots", "Football"],
  ["Saints", "Football"],
  ["Falcons", "Football"],
  ["Panthers", "Football"],
  ["Buccaneers", "Football"],
  ["Cardinals", "Football"],
  ["Rams", "Football"],
  ["Seahawks", "Football"],
  ["Lakers", "Basketball"],
  ["Celtics", "Basketball"],
  ["Warriors", "Basketball"],
  ["Knicks", "Basketball"],
  ["Bulls", "Basketball"],
  ["Heat", "Basketball"],
  ["Spurs", "Basketball"],
  ["Nuggets", "Basketball"],
  ["Bucks", "Basketball"],
  ["Suns", "Basketball"],
  ["Mavericks", "Basketball"],
  ["76ers", "Basketball"],
  ["Nets", "Basketball"],
  ["Thunder", "Basketball"],
  ["Timberwolves", "Basketball"],
  ["Cavaliers", "Basketball"],
  ["Rockets", "Basketball"],
  ["Grizzlies", "Basketball"],
  ["Pelicans", "Basketball"],
  ["Clippers", "Basketball"],
  ["Hawks", "Basketball"],
  ["Raptors", "Basketball"],
  ["Yankees", "Baseball"],
  ["Dodgers", "Baseball"],
  ["Red Sox", "Baseball"],
  ["Cubs", "Baseball"],
  ["Mets", "Baseball"],
  ["Braves", "Baseball"],
  ["Astros", "Baseball"],
  ["Phillies", "Baseball"],
  ["Padres", "Baseball"],
  ["Rangers", "Baseball"],
  ["Orioles", "Baseball"],
  ["Giants", "Baseball"],
  ["Cardinals", "Baseball"],
  ["Guardians", "Baseball"],
  ["Mariners", "Baseball"],
  ["Brewers", "Baseball"],
  ["Oilers", "Hockey"],
  ["Maple Leafs", "Hockey"],
  ["Canadiens", "Hockey"],
  ["Bruins", "Hockey"],
  ["Rangers", "Hockey"],
  ["Penguins", "Hockey"],
  ["Blackhawks", "Hockey"],
  ["Avalanche", "Hockey"],
  ["Golden Knights", "Hockey"],
  ["Red Wings", "Hockey"],
  ["Lightning", "Hockey"],
  ["Panthers", "Hockey"],
  ["Manchester City", "Soccer"],
  ["Real Madrid", "Soccer"],
  ["Barcelona", "Soccer"],
  ["Liverpool", "Soccer"],
  ["Arsenal", "Soccer"],
  ["Chelsea", "Soccer"],
  ["Bayern Munich", "Soccer"],
  ["PSG", "Soccer"],
  ["Inter Miami", "Soccer"],
  ["Juventus", "Soccer"],
].map(([name, sport]) => ({ name: name ?? "", sport: sport ?? "" }));

export const COLLECT_TEAMS = TEAM_ROWS;

export function collectSportBlocked(sport: string): boolean {
  return BLOCKED_SPORT.test(sport.trim());
}

/**
 * Football, basketball, baseball, hockey, and soccer, then any other catalog
 * sport that is not Pokémon or a TCG.
 */
export function collectSportChoices(catalogSports: readonly string[] = []): string[] {
  const preferred = [...PREFERRED_COLLECT_SPORTS];
  const seen = new Set(preferred.map((sport) => sport.toLowerCase()));
  const extras: string[] = [];
  let other = false;
  for (const sport of [...SPORT_PICKER_OPTIONS, ...catalogSports]) {
    const name = sport.trim();
    if (!name || collectSportBlocked(name)) continue;
    if (name.toLowerCase() === "other") {
      other = true;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(name);
  }
  extras.sort((a, b) => a.localeCompare(b));
  return other ? [...preferred, ...extras, "Other"] : [...preferred, ...extras];
}

export type InterestHit = {
  kind: "team" | "player";
  value: string;
  sport: string;
  /** Player name is in more than one sport, so the chip keeps this sport. */
  sharedName?: boolean;
};

/**
 * Suffix for a shared player. Format characters only, so public.norm and
 * normInterest still equal the player name. No extra column.
 * Baseball, Basketball, Football, Hockey, and Soccer are the roster sports.
 */
const SHARED_PLAYER_MARK = "\u2060";
const SHARED_PLAYER_SPORTS: readonly { sport: string; code: string }[] = [
  { sport: "Baseball", code: "\u200b" },
  { sport: "Basketball", code: "\u200c" },
  { sport: "Football", code: "\u200d" },
  { sport: "Hockey", code: "\u2062" },
  { sport: "Soccer", code: "\u2063" },
];

export function packSharedPlayer(name: string, sport: string): string | null {
  const code = SHARED_PLAYER_SPORTS.find((item) => item.sport.toLowerCase() === sport.trim().toLowerCase());
  const trimmed = name.trim();
  if (!code || !trimmed) return null;
  const packed = `${trimmed}${SHARED_PLAYER_MARK}${code.code}`;
  return packed.length <= 80 ? packed : null;
}

export function unpackSharedPlayer(value: string): { name: string; sport: string } | null {
  const mark = value.lastIndexOf(SHARED_PLAYER_MARK);
  if (mark < 0) return null;
  const sport = SHARED_PLAYER_SPORTS.find((item) => item.code === value.slice(mark + SHARED_PLAYER_MARK.length));
  const name = value.slice(0, mark).trim();
  if (!sport || !name) return null;
  return { name, sport: sport.sport };
}

/** True when this compact name is listed under two different sports. */
export function playerNameIsShared(
  name: string,
  players: readonly { name: string; sport?: string; compact?: string }[],
): boolean {
  const key = compactInterest(name);
  if (!key) return false;
  let seen = "";
  for (const player of players) {
    const compact = player.compact ?? compactInterest(player.name);
    if (compact !== key) continue;
    const sport = (player.sport ?? "").trim().toLowerCase();
    if (!sport) continue;
    if (!seen) {
      seen = sport;
      continue;
    }
    if (sport !== seen) return true;
  }
  return false;
}

/**
 * Typeahead for teams and catalog players. Empty queries return nothing.
 * Selected sports narrow the list. Pokémon and TCG players are dropped.
 */
export function interestTypeahead(input: {
  query: string;
  sports?: readonly string[];
  players: readonly { name: string; sport: string }[];
  teams?: readonly { name: string; sport: string }[];
  limit?: number;
}): InterestHit[] {
  const query = normInterest(input.query);
  if (!query) return [];
  const sports = (input.sports ?? []).map((sport) => sport.toLowerCase()).filter(Boolean);
  const allowed = (sport: string) =>
    !collectSportBlocked(sport) &&
    (sports.length === 0 || sports.includes(sport.toLowerCase()));
  const hits: InterestHit[] = [];
  const seen = new Set<string>();
  const playersByKey = new Map<string, { hit: InterestHit; names: string[] }[]>();
  for (const team of input.teams ?? COLLECT_TEAMS) {
    if (!allowed(team.sport)) continue;
    const norm = normInterest(team.name);
    if (!norm.includes(query)) continue;
    const key = `team:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ kind: "team", value: team.name, sport: team.sport });
  }
  for (const player of input.players) {
    if (!allowed(player.sport)) continue;
    const norm = normInterest(player.name);
    if (!norm || (!norm.includes(query) && !compactPlayerQueryMatches(input.query, player.name))) continue;
    const key = compactInterest(player.name);
    const group = playersByKey.get(key);
    const existing = group?.find((item) => playerSportsCompatible(item.hit.sport, player.sport));
    if (existing) {
      existing.names.push(player.name);
      existing.hit.value = majorityPlayerSpelling(existing.names);
      continue;
    }
    const hit: InterestHit = { kind: "player", value: player.name, sport: player.sport };
    const bucket = { hit, names: [player.name] };
    if (group) group.push(bucket);
    else playersByKey.set(key, [bucket]);
    hits.push(hit);
  }
  hits.sort((a, b) => {
    const aStart = normInterest(a.value).startsWith(query) ? 0 : 1;
    const bStart = normInterest(b.value).startsWith(query) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return a.value.localeCompare(b.value);
  });
  const limit = input.limit == null ? 8 : Math.max(0, Math.floor(input.limit));
  return hits.slice(0, limit);
}

export function interestsAnswered(rows: readonly { kind: string }[]): boolean {
  return rows.some(
    (row) =>
      row.kind === "prompt" ||
      row.kind === "sport" ||
      row.kind === "team" ||
      row.kind === "player",
  );
}

/** The sheet stays hidden while loading, signed out, or when the table is missing. */
export function collectPromptVisible(input: {
  signedIn: boolean;
  table: InterestLoad["status"];
  answered: boolean;
  pathname?: string;
}): boolean {
  if (!input.signedIn) return false;
  if (input.table !== "ready") return false;
  if (input.answered) return false;
  if ((input.pathname ?? "").startsWith("/settings/collecting")) return false;
  return true;
}

export function collectStepAfter(
  step: CollectStep,
  action: "next" | "back" | "skip" | "done",
): { type: "step"; step: CollectStep } | { type: "skip" } | { type: "done" } {
  if (action === "skip") return { type: "skip" };
  if (action === "done") return { type: "done" };
  if (action === "back") {
    if (step === "people") return { type: "step", step: "names" };
    if (step === "names") return { type: "step", step: "sports" };
    return { type: "step", step: "sports" };
  }
  if (step === "sports") return { type: "step", step: "names" };
  if (step === "names") return { type: "step", step: "people" };
  return { type: "done" };
}

function storedInterestValue(pick: CollectInterest): string {
  const name = pick.value.replace(/\u2060/g, "").trim();
  if (!name) return "";
  if (pick.kind === "player" && pick.sport?.trim()) {
    const packed = packSharedPlayer(name, pick.sport);
    if (packed) return packed;
  }
  return name.slice(0, 80);
}

export function picksFromRows(rows: readonly InterestRow[]): CollectInterest[] {
  const picks: CollectInterest[] = [];
  for (const row of rows) {
    if (row.kind !== "sport" && row.kind !== "team" && row.kind !== "player") continue;
    if (row.kind !== "player") {
      picks.push({ kind: row.kind, value: row.value });
      continue;
    }
    const unpacked = unpackSharedPlayer(row.value);
    picks.push(
      unpacked
        ? { kind: "player", value: unpacked.name, sport: unpacked.sport }
        : { kind: "player", value: row.value },
    );
  }
  const tagged = new Set(
    picks
      .filter((pick) => pick.kind === "player" && pick.sport)
      .map((pick) => compactInterest(pick.value)),
  );
  return picks.filter((pick) => {
    if (pick.kind !== "player" || pick.sport) return true;
    return !tagged.has(compactInterest(pick.value));
  });
}

/** Rows written when they finish or skip. Prompt is how we know not to ask again. */
export function interestWriteRows(
  action: "skip" | "complete",
  picks: readonly CollectInterest[] = [],
): InterestRow[] {
  if (action === "skip") return [{ kind: "prompt", value: "skipped" }];
  const seen = new Set<string>();
  const rows: InterestRow[] = [];
  for (const pick of picks) {
    const value = storedInterestValue(pick);
    if (!value) continue;
    if (pick.kind === "sport" && collectSportBlocked(value)) continue;
    const key = `${pick.kind}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind: pick.kind, value });
  }
  rows.push({ kind: "prompt", value: "done" });
  return rows;
}

/**
 * Save picks without wiping them when the insert fails.
 * Removed picks are deleted after the new rows are stored, unless the
 * existing rows plus the new rows would pass 50. Then the removed picks
 * go first so a full swap still fits under the trigger.
 */
export async function persistInterestRows(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly InterestRow[],
): Promise<"saved" | "missing" | "limit" | "error"> {
  const existing = await supabase
    .from("profile_interests")
    .select("kind, value")
    .eq("user_id", userId);
  if (existing.error) return schemaMissing(existing.error) ? "missing" : "error";
  const current = [...(existing.data ?? [])];
  const keep = new Set(rows.map((row) => `${row.kind}:${row.value}`));
  const swapFirst = current.length + rows.length > 50;

  async function upsertRows(): Promise<"ok" | "missing" | "limit" | "error"> {
    if (rows.length === 0) return "ok";
    const inserted = await supabase.from("profile_interests").upsert(
      rows.map((row) => ({ user_id: userId, kind: row.kind, value: row.value })),
      { onConflict: "user_id,kind,value" },
    );
    if (inserted.error) {
      if (schemaMissing(inserted.error)) return "missing";
      if (interestLimitReached(inserted.error)) return "limit";
      return "error";
    }
    return "ok";
  }

  async function deleteRemoved(): Promise<"ok" | "missing" | "error"> {
    for (const row of current) {
      const kind = row.kind;
      const value = row.value;
      if (!kind || !value || keep.has(`${kind}:${value}`)) continue;
      const removed = await supabase
        .from("profile_interests")
        .delete()
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("value", value);
      if (removed.error) return schemaMissing(removed.error) ? "missing" : "error";
    }
    return "ok";
  }

  if (swapFirst) {
    const deleted = await deleteRemoved();
    if (deleted !== "ok") return deleted;
    const inserted = await upsertRows();
    if (inserted !== "ok") return inserted;
    return "saved";
  }

  const inserted = await upsertRows();
  if (inserted !== "ok") return inserted;
  const deleted = await deleteRemoved();
  if (deleted !== "ok") return deleted;
  return "saved";
}

export function schemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|could not find the table|does not exist/i.test(message)
  );
}

export function rpcMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|schema cache/i.test(message)
  );
}
