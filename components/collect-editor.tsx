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
  type InterestHit,
} from "@/lib/social/collect-interests";
import type { CollectInterest } from "@/lib/social/follow-rank";
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

  const hits = withDirectoryPlayers({
    query,
    sports,
    catalogHits: interestTypeahead({
      query,
      sports,
      players,
      teams: COLLECT_TEAMS,
    }),
    directoryPlayers: directory.players,
    directoryReady: directory.ready,
  });

  return (
    <div>
      {names.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {names.map((pick) => (
            <button
              key={`${pick.kind}:${pick.value}`}
              type="button"
              onClick={() => onRemove(pick)}
              className={`${chipClass} gap-1.5 border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950`}
            >
              {pick.value}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Remove {pick.value}</span>
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
      {hits.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
          {hits.map((hit) => (
            <li key={`${hit.kind}:${hit.value}`}>
              <button
                type="button"
                onClick={() => {
                  onAdd(hit);
                  setQuery("");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-[15px] hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <span className="truncate font-medium">{nameSuggestionLabel(hit)}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {hit.kind === "team" ? "Team" : "Player"}
                </span>
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

export function toggleName(
  selected: readonly CollectInterest[],
  hit: InterestHit,
): CollectInterest[] {
  const key = `${hit.kind}:${hit.value.toLowerCase()}`;
  if (selected.some((pick) => `${pick.kind}:${pick.value.toLowerCase()}` === key)) return [...selected];
  return [...selected, { kind: hit.kind, value: hit.value }];
}

export function withoutName(
  selected: readonly CollectInterest[],
  hit: CollectInterest,
): CollectInterest[] {
  const key = `${hit.kind}:${hit.value.toLowerCase()}`;
  return selected.filter((pick) => `${pick.kind}:${pick.value.toLowerCase()}` !== key);
}
