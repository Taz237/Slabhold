"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchCatalog } from "@/lib/card-catalog";
import { collapseInitials } from "@/lib/players/initials";
import { nameSuggestionLabel, withDirectoryPlayers } from "@/lib/players/suggest";
import { usePlayerDirectory } from "@/lib/players/use-directory";
import {
  COLLECT_TEAMS,
  collectSportChoices,
  interestTypeahead,
  playerNameIsShared,
  type InterestHit,
} from "@/lib/social/collect-interests";
import { compactInterest, normInterest, type CollectInterest } from "@/lib/social/follow-rank";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/client";

const chipClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold";

export function SportChips({
  sports,
  selected,
  onToggle,
}: {
  sports: readonly string[];
  selected: readonly string[];
  onToggle: (sport: string) => void;
}) {
  const picked = new Set(selected.map((sport) => sport.toLowerCase()));
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sports">
      {sports.map((sport) => {
        const on = picked.has(sport.toLowerCase());
        return (
          <button
            key={sport}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(sport)}
            className={
              on
                ? `${chipClass} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950`
                : `${chipClass} border-zinc-300 bg-white text-zinc-900 dark:border-white/15 dark:bg-transparent`
            }
          >
            {sport}
          </button>
        );
      })}
    </div>
  );
}

export function useCollectSports(catalogSports: readonly string[]) {
  return useMemo(() => collectSportChoices(catalogSports), [catalogSports]);
}

/** React key for a suggestion row. Sport keeps Will Smith baseball and hockey apart. */
export function nameHitKey(hit: { kind: string; value: string; sport?: string }): string {
  return `${hit.kind}:${hit.value}:${hit.sport ?? ""}`;
}

function nameRowLabel(hit: { kind: string; sport?: string }): string {
  if (hit.kind === "team") return "Team";
  return hit.sport ? `Player · ${hit.sport}` : "Player";
}

/**
 * The other search_cards query for initials. "c.j. stroud" also searches "cj stroud",
 * and "cj stroud" also searches "c.j. stroud". A trailing fragment such as "st" stays put.
 */
export function alternateInitialQuery(query: string): string | null {
  const norm = normInterest(query);
  if (!norm) return null;
  const words = norm.split(" ").filter(Boolean);
  const joined = collapseInitials(words).join(" ");
  if (joined !== norm) return joined;
  let dotted = false;
  const expanded = words.map((word, index) => {
    if (word.length !== 2 || index === words.length - 1) return word;
    dotted = true;
    return `${word[0]}.${word[1]}.`;
  });
  return dotted ? expanded.join(" ") : null;
}

export function cardSearchQueries(query: string): string[] {
  const primary = query.trim();
  if (!primary) return [];
  const extra = alternateInitialQuery(primary);
  if (!extra || extra.toLowerCase() === primary.toLowerCase()) return [primary];
  return [primary, extra];
}

/** Stop waiting on a hung search_cards call so the Add row can still appear. */
export const COLLECT_SEARCH_TIMEOUT_MS = 3_000;

const COLLECT_SEARCH_DEBOUNCE_MS = 120;

export type SearchCardRow = {
  id?: string | null;
  player?: string | null;
  sport?: string | null;
};

/** False when a slower earlier search would replace the current input's rows. */
export function collectSearchResultApplies(
  incoming: { requestId: number; query: string },
  latest: { requestId: number; query: string },
): boolean {
  return incoming.requestId === latest.requestId && incoming.query.trim() === latest.query.trim();
}

/**
 * One row per card id. "c.j. stroud" and "cj stroud" can both return the same
 * card, and counting it twice would tip C.J. vs CJ the wrong way.
 */
export function dedupeSearchCardGroups(
  groups: readonly (readonly SearchCardRow[])[],
): { name: string; sport: string }[] {
  const seen = new Set<string>();
  const players: { name: string; sport: string }[] = [];
  for (const group of groups) {
    for (const row of group) {
      const name = row.player?.trim() ?? "";
      if (!name) continue;
      const id = row.id?.trim() ?? "";
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      players.push({ name, sport: row.sport?.trim() || "" });
    }
  }
  return players;
}

/** Resolves with fallback when request is still pending after timeoutMs. */
export function collectSearchTimeoutResult<T>(
  request: Promise<T>,
  timeoutMs: number,
  fallback: T,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      resolve(fallback);
    }, timeoutMs);
    void request.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

type SearchCardsClient = NonNullable<ReturnType<typeof createSupabaseBrowser>>;

async function loadSearchCardRows(
  supabase: SearchCardsClient,
  term: string,
  signal: AbortSignal,
): Promise<SearchCardRow[]> {
  try {
    const builder = supabase.rpc("search_cards", { q: term, max_results: 20 });
    const pending =
      typeof (builder as { abortSignal?: (rpcSignal: AbortSignal) => typeof builder }).abortSignal ===
      "function"
        ? (builder as { abortSignal: (rpcSignal: AbortSignal) => typeof builder }).abortSignal(signal)
        : builder;
    const { data, error } = await pending;
    if (signal.aborted || error || !data) return [];
    return data as SearchCardRow[];
  } catch {
    return [];
  }
}

async function loadCollectSearchPlayers(
  supabase: SearchCardsClient,
  query: string,
  parent: AbortSignal,
): Promise<{ name: string; sport: string }[]> {
  const groups = await Promise.all(
    cardSearchQueries(query).map((term) => {
      const child = new AbortController();
      const abortChild = () => child.abort();
      if (parent.aborted) abortChild();
      else parent.addEventListener("abort", abortChild, { once: true });
      return collectSearchTimeoutResult(
        loadSearchCardRows(supabase, term, child.signal),
        COLLECT_SEARCH_TIMEOUT_MS,
        [] as SearchCardRow[],
        abortChild,
      ).finally(() => {
        parent.removeEventListener("abort", abortChild);
      });
    }),
  );
  return dedupeSearchCardGroups(groups);
}

export function NameSearch({
  sports,
  selected,
  onAdd,
  onRemove,
}: {
  sports: readonly string[];
  selected: readonly CollectInterest[];
  onAdd: (hit: InterestHit) => void;
  onRemove: (hit: CollectInterest) => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteQuery, setRemoteQuery] = useState("");
  const [remotePlayers, setRemotePlayers] = useState<{ name: string; sport: string }[]>([]);
  const requestRef = useRef(0);
  const queryRef = useRef(query);
  const names = selected.filter((pick) => pick.kind !== "sport");

  function setSearchQuery(value: string) {
    queryRef.current = value;
    requestRef.current += 1;
    setQuery(value);
  }

  useEffect(() => {
    const requestId = requestRef.current;
    const q = query.trim();
    if (q.length < 1) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadCollectSearchPlayers(supabase, q, controller.signal)
        .catch(() => [] as { name: string; sport: string }[])
        .then((players) => {
          if (
            !collectSearchResultApplies(
              { requestId, query: q },
              { requestId: requestRef.current, query: queryRef.current },
            )
          ) {
            return;
          }
          setRemoteQuery(q);
          setRemotePlayers(players);
        });
    }, COLLECT_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
      controller.abort();
    };
  }, [query]);

  const directory = usePlayerDirectory();
  const players = useMemo(() => {
    const local = searchCatalog(query.trim(), 20).map((card) => ({
      name: card.playerName,
      sport: card.sport,
    }));
    const remote = remoteQuery === query.trim() ? remotePlayers : [];
    return [...local, ...remote];
  }, [query, remotePlayers, remoteQuery]);

  const directoryReady = directory.status === "ready";
  const typed = query.trim().length > 0;
  const catalogSettled = !getSupabaseConfig().configured || !typed || remoteQuery === query.trim();
  const hits = useMemo(() => {
    const found = withDirectoryPlayers({
      query,
      sports,
      catalogHits: interestTypeahead({
        query,
        sports,
        players,
        teams: COLLECT_TEAMS,
      }),
      directoryPlayers: directory.players,
      directoryReady,
    });
    return selectableCollectHits(
      hitsBeforeDirectoryReady(found, directoryReady),
      players.map((player) => player.name),
      catalogSettled,
    );
  }, [catalogSettled, directory.players, directoryReady, players, query, sports]);

  return (
    <div>
      {names.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {names.map((pick) => (
            <button
              key={`${pick.kind}:${pick.value}:${pick.sport ?? ""}`}
              type="button"
              onClick={() => onRemove(pick)}
              className={`${chipClass} gap-1.5 border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950`}
            >
              {pickedNameLabel(pick)}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Remove {pickedNameLabel(pick)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="sr-only">Search players and teams</span>
        <input
          value={query}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search players and teams"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-h-11 w-full rounded-2xl border border-zinc-300 bg-white px-4 text-base outline-none focus:border-zinc-500 dark:border-white/15 dark:bg-transparent"
        />
      </label>
      {directory.status === "loading" && typed ? (
        <p className="mt-2 text-sm text-zinc-500">Loading players…</p>
      ) : null}
      {directory.status === "error" ? (
        <div className="mt-2 text-sm text-zinc-500">
          Could not load the player list.{" "}
          <button type="button" onClick={directory.retry} className="min-h-11 min-w-11 px-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}
      {typed && directory.status !== "loading" && catalogSettled && hits.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No players found</p>
      ) : null}
      {hits.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
          {hits.map((hit) => (
            <li key={nameHitKey(hit)} data-key={nameHitKey(hit)}>
              <button
                type="button"
                onClick={() => {
                  if (hit.kind === "player" && directory.status !== "ready") return;
                  const sharedName =
                    hit.kind === "player" && playerNameIsShared(hit.value, directory.players);
                  onAdd(sharedName ? { ...hit, sharedName: true } : hit);
                  setSearchQuery("");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-[15px] hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <span className="truncate font-medium">{nameSuggestionLabel(hit)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{nameRowLabel(hit)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function toggleSport(selected: readonly string[], sport: string): string[] {
  const key = sport.toLowerCase();
  if (selected.some((item) => item.toLowerCase() === key)) {
    return selected.filter((item) => item.toLowerCase() !== key);
  }
  return [...selected, sport];
}

/** Player rows wait until the roster chunk has loaded, so a shared name is not guessed early. */
export function hitsBeforeDirectoryReady<T extends { kind: string }>(
  hits: readonly T[],
  directoryReady: boolean,
): T[] {
  if (directoryReady) return [...hits];
  return hits.filter((hit) => hit.kind !== "player");
}

/** Directory spellings stay unselectable until search_cards has answered for this query. */
export function selectableCollectHits<T extends { kind: string; value: string; custom?: boolean }>(
  hits: readonly T[],
  catalogNames: readonly string[],
  catalogSettled: boolean,
): T[] {
  if (catalogSettled) return [...hits];
  const keys = new Set(catalogNames.map((name) => compactInterest(name)));
  return hits.filter(
    (hit) => hit.kind !== "player" || (!hit.custom && keys.has(compactInterest(hit.value))),
  );
}

/** "Will Smith · Baseball" when the saved player name is shared. Other chips stay the name. */
export function pickedNameLabel(pick: { kind: string; value: string; sport?: string }): string {
  if (pick.kind === "player" && pick.sport) return `${pick.value} · ${pick.sport}`;
  return pick.value;
}

function picksMatch(
  pick: CollectInterest,
  hit: { kind: string; value: string; sport?: string; sharedName?: boolean },
): boolean {
  if (pick.kind !== hit.kind) return false;
  if (compactInterest(pick.value) !== compactInterest(hit.value)) return false;
  if (hit.kind !== "player") return true;
  const left = normInterest(pick.sport ?? "");
  const right = hit.sharedName ? normInterest(hit.sport ?? "") : "";
  if (!left || !right) return true;
  return left === right;
}

function storedPick(hit: InterestHit): CollectInterest {
  const value = hit.value.replace(/\u2060/g, "");
  if (hit.kind === "player" && hit.sharedName && hit.sport.trim()) {
    return { kind: hit.kind, value, sport: hit.sport };
  }
  return { kind: hit.kind, value };
}

export function nameAlreadyPicked(selected: readonly CollectInterest[], hit: InterestHit): boolean {
  return selected.some((pick) => picksMatch(pick, hit));
}

export function toggleName(
  selected: readonly CollectInterest[],
  hit: InterestHit,
): CollectInterest[] {
  let replaced = false;
  const next: CollectInterest[] = [];
  const incoming = storedPick(hit);
  for (const pick of selected) {
    if (!picksMatch(pick, hit)) {
      next.push(pick);
      continue;
    }
    if (replaced) continue;
    const sameValue = pick.value === incoming.value;
    const sameSport = normInterest(pick.sport ?? "") === normInterest(incoming.sport ?? "");
    next.push(sameValue && sameSport ? pick : incoming);
    replaced = true;
  }
  if (!replaced) next.push(incoming);
  return next;
}

export function withoutName(
  selected: readonly CollectInterest[],
  hit: CollectInterest,
): CollectInterest[] {
  const index = selected.findIndex(
    (pick) =>
      pick.kind === hit.kind &&
      pick.value === hit.value &&
      normInterest(pick.sport ?? "") === normInterest(hit.sport ?? ""),
  );
  if (index < 0) return [...selected];
  return selected.filter((_, item) => item !== index);
}
