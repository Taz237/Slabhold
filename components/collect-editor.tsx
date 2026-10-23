"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { searchCatalog } from "@/lib/card-catalog";
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
  const names = selected.filter((pick) => pick.kind !== "sport");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void supabase
        .rpc("search_cards", { q, max_results: 20 })
        .then(({ data, error }) => {
          if (cancelled || error || !data) return;
          const rows = data as { player?: string; sport?: string | null }[];
          setRemoteQuery(q);
          setRemotePlayers(
            rows
              .filter((row) => row.player)
              .map((row) => ({ name: row.player ?? "", sport: row.sport || "" })),
          );
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
    return hitsBeforeDirectoryReady(found, directoryReady);
  }, [directory.players, directoryReady, players, query, sports]);
  const typed = query.trim().length > 0;

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
          onChange={(event) => setQuery(event.target.value)}
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
      {typed && directory.status !== "loading" && hits.length === 0 ? (
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
                  setQuery("");
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
