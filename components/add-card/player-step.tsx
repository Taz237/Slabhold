"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Chip, SectionLabel, focusRing } from "@/components/add-card/flow-ui";
import { PLAYER_SEARCH_DEBOUNCE_MS, searchAddPlayers } from "@/lib/cards/add-flow-players";
import { usePlayerDirectory } from "@/lib/players/use-directory";

export type PlayerPick = { name: string; sport: string | null };

/**
 * Who's on the card. Recent and collection chips above a big search field.
 * Results come from the bundled roster; a typed name still works.
 */
export function PlayerStep({
  initial,
  recent,
  owned,
  onPick,
}: {
  initial: string;
  recent: readonly string[];
  owned: readonly { name: string; sport: string }[];
  onPick: (pick: PlayerPick) => void;
}) {
  const [query, setQuery] = useState(initial);
  const [settled, setSettled] = useState(initial);
  const directory = usePlayerDirectory();

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), PLAYER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // One pass over the roster per settled query, not per render.
  const hits = useMemo(
    () => searchAddPlayers(settled, directory.players),
    [settled, directory.players],
  );

  const typed = query.trim();
  const exact = hits.some((hit) => !hit.custom && hit.name.toLowerCase() === typed.toLowerCase());
  const waiting = typed !== "" && (directory.status === "loading" || settled !== query) && hits.length === 0;
  const rosterHits = hits.filter((hit) => !hit.custom);

  function sportFor(name: string): string | null {
    const key = name.trim().toLowerCase();
    const mine = owned.find((item) => item.name.toLowerCase() === key);
    if (mine?.sport) return mine.sport;
    return directory.players.find((player) => player.name.toLowerCase() === key)?.sport ?? null;
  }

  function pickTyped() {
    if (!typed) return;
    const first = rosterHits[0];
    if (first && first.name.toLowerCase().startsWith(typed.toLowerCase())) {
      onPick({ name: first.name, sport: first.sport || null });
      return;
    }
    onPick({ name: typed, sport: sportFor(typed) });
  }

  return (
    <div className="space-y-5">
      {recent.length > 0 ? (
        <div>
          <SectionLabel>Recent</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {recent.map((name) => (
              <Chip key={`recent:${name}`} onClick={() => onPick({ name, sport: sportFor(name) })}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {owned.length > 0 ? (
        <div>
          <SectionLabel>In your collection</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {owned.map((item) => (
              <Chip
                key={`owned:${item.name}`}
                onClick={() => onPick({ name: item.name, sport: item.sport || null })}
              >
                {item.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <label className="relative block">
          <span className="sr-only">Player name</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            data-field="playerName"
            value={query}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              pickTyped();
            }}
            placeholder="Search players"
            className={`h-14 w-full rounded-2xl border border-zinc-200 bg-white pr-4 pl-12 text-lg font-semibold tracking-tight text-zinc-900 placeholder:font-medium placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:placeholder:text-zinc-500 ${focusRing}`}
          />
        </label>

        {typed ? (
          <ul className="mt-2 divide-y divide-zinc-200/80 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.03]">
            {waiting
              ? [0, 1, 2].map((row) => (
                  <li key={`skeleton-${row}`} className="flex min-h-14 items-center gap-3 px-4" aria-hidden>
                    <span className="skeleton-shimmer h-4 w-40 rounded-full" />
                    <span className="skeleton-shimmer ml-auto h-3 w-16 rounded-full" />
                  </li>
                ))
              : rosterHits.map((hit) => (
                  <li key={`${hit.name}|${hit.sport}`}>
                    <button
                      type="button"
                      onClick={() => onPick({ name: hit.name, sport: hit.sport || null })}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-violet-500/5 ${focusRing} focus-visible:ring-inset`}
                    >
                      <span className="min-w-0 truncate text-base font-semibold tracking-tight">
                        {hit.name}
                      </span>
                      <span className="min-w-0 shrink truncate text-right text-xs text-zinc-500">
                        {[hit.sport, hit.team].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
            {!waiting && !exact ? (
              <li>
                <button
                  type="button"
                  onClick={() => onPick({ name: typed, sport: sportFor(typed) })}
                  className={`flex min-h-14 w-full items-center px-4 text-left text-sm font-semibold text-violet-700 hover:bg-violet-500/5 dark:text-[#A78BFA] ${focusRing} focus-visible:ring-inset`}
                >
                  Use &ldquo;{typed}&rdquo;
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
        {directory.status === "error" ? (
          <p className="mt-2 text-xs text-zinc-500">
            Couldn&apos;t load player names.{" "}
            <button
              type="button"
              onClick={directory.retry}
              className="min-h-11 font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
            >
              Try again
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
