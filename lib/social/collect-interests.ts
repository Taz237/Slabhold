import { SPORT_PICKER_OPTIONS } from "../card-options";
import { normInterest, type CollectInterest, type InterestKind } from "./follow-rank";

/** Sports the onboarding picker never offers. */
const BLOCKED_SPORT = /pok[eé]mon|\btcg\b|magic|yu-?gi-?oh/i;

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
};

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
    if (!norm || !norm.includes(query)) continue;
    const key = `player:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ kind: "player", value: player.name, sport: player.sport });
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

export function picksFromRows(rows: readonly InterestRow[]): CollectInterest[] {
  return rows
    .filter(
      (row): row is CollectInterest =>
        row.kind === "sport" || row.kind === "team" || row.kind === "player",
    )
    .map((row) => ({ kind: row.kind, value: row.value }));
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
    const value = pick.value.trim().slice(0, 80);
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
