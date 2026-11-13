"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Chip, QuietButton, SectionLabel, SwatchDot, focusRing } from "@/components/add-card/flow-ui";
import type { PlayerPick } from "@/components/add-card/player-step";
import type { CatalogCard } from "@/lib/card-catalog";
import {
  DOOR_PLACEHOLDER,
  doorCatalog,
  doorEnterPick,
  doorInserts,
  doorSets,
  doorTypedName,
  doorWantsCatalog,
  parseDoorQuery,
} from "@/lib/cards/add-door";
import { PLAYER_SEARCH_DEBOUNCE_MS } from "@/lib/cards/add-flow-players";
import { loadCatalogSearchSession } from "@/lib/catalog/catalog-search-session";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";
import { usePlayerDirectory } from "@/lib/players/use-directory";
import { ScanEntry } from "@/components/scan/scan-entry";
import { HUB_COPY } from "@/lib/scan/entry";

export type DoorPick = PlayerPick & { insert: string | null };

const rowClass = `flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-violet-500/5 ${focusRing} focus-visible:ring-inset`;

/**
 * "What's on the card?" One field for a player, an insert, a set or a catalog
 * card. "Malik Nabers Kaboom" fills the player and the insert in one tap.
 * Recent and In your collection stay as chips; "Or add step by step" opens the
 * classic player question.
 */
export function SearchDoor({
  initialQuery,
  recent,
  owned,
  insert,
  setBrand,
  onQuery,
  onPickPlayer,
  onPickInsert,
  onPickSet,
  onPickCatalog,
  onStepByStep,
  scanHref = null,
}: {
  /** The scanner, when it is on: the first thing on the door. */
  scanHref?: string | null;
  initialQuery: string;
  recent: readonly string[];
  owned: readonly { name: string; sport: string }[];
  /** The insert already chosen on the door, if any. */
  insert: string | null;
  /** The set already chosen on the door, if any. */
  setBrand: string;
  onQuery: (query: string) => void;
  onPickPlayer: (pick: DoorPick) => void;
  onPickInsert: (name: string | null) => void;
  onPickSet: (name: string | null) => void;
  onPickCatalog: (card: CatalogCard) => void;
  onStepByStep: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [settled, setSettled] = useState(initialQuery);
  const directory = usePlayerDirectory();

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), PLAYER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // One pass over the roster per settled query, not per keystroke.
  const parsed = useMemo(() => parseDoorQuery(settled, directory.players), [settled, directory.players]);
  const inserts = useMemo(
    () => doorInserts(settled, parsed).filter((name) => name !== insert),
    [settled, parsed, insert],
  );
  const sets = useMemo(
    () => doorSets(parsed.insert ? parsed.playerQuery : settled).filter((name) => name !== setBrand),
    [settled, parsed, setBrand],
  );

  // One search_cards call per settled query with enough characters.
  const catalogQuery = doorWantsCatalog(settled) ? settled.trim() : "";
  const [catalog, setCatalog] = useState<{ query: string; rows: CatalogCard[] } | null>(null);
  useEffect(() => {
    if (!catalogQuery) return;
    const session = loadCatalogSearchSession({ query: catalogQuery, search: searchCatalogRemote, limit: 8 });
    void session.done.then((snapshot) => {
      if (snapshot.aborted) return;
      setCatalog({ query: catalogQuery, rows: doorCatalog(snapshot.results) });
    });
    return () => session.abort();
  }, [catalogQuery]);
  const catalogRows = catalog && catalog.query === catalogQuery ? catalog.rows : [];
  const catalogLoading = catalogQuery !== "" && catalog?.query !== catalogQuery;

  const typed = query.trim();
  const typedName = doorTypedName(settled, parsed);
  const exact = parsed.players.some((hit) => hit.name.toLowerCase() === typedName.toLowerCase());
  const waiting =
    typed !== "" && (directory.status === "loading" || settled !== query) && parsed.players.length === 0;
  const chosenInsert = insert ?? parsed.insert;

  function update(next: string) {
    setQuery(next);
    onQuery(next);
  }

  function sportFor(name: string): string | null {
    const key = name.trim().toLowerCase();
    const mine = owned.find((item) => item.name.toLowerCase() === key);
    if (mine?.sport) return mine.sport;
    return directory.players.find((player) => player.name.toLowerCase() === key)?.sport ?? null;
  }

  function pick(name: string, sport: string | null, withInsert: string | null) {
    onPickPlayer({ name, sport: sport ?? sportFor(name), insert: withInsert ?? insert });
  }

  function enter() {
    const now = parseDoorQuery(query, directory.players);
    const choice = doorEnterPick(query, now);
    if (choice) pick(choice.name, choice.sport, choice.insert);
  }

  return (
    <div className="space-y-5">
      {scanHref && !typed ? <ScanEntry href={scanHref} title={HUB_COPY.addEntry} body={HUB_COPY.addEntryBody} /> : null}
      <div>
        <label className="relative block">
          <span className="sr-only">Search a player, insert, set or card</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            data-field="playerName"
            value={query}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => update(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              enter();
            }}
            placeholder={DOOR_PLACEHOLDER}
            className={`h-14 w-full rounded-2xl border border-zinc-200 bg-white pr-4 pl-12 text-lg font-semibold tracking-tight text-zinc-900 placeholder:text-15 placeholder:font-medium placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:placeholder:text-zinc-500 ${focusRing}`}
          />
        </label>

        {insert || setBrand ? (
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Picked so far" role="group">
            {setBrand ? (
              <Picked label={`Set: ${setBrand}`} onClear={() => onPickSet(null)}>
                {setBrand}
              </Picked>
            ) : null}
            {insert ? (
              <Picked label={`Insert: ${insert}`} onClear={() => onPickInsert(null)}>
                <SwatchDot name={insert} size="sm" />
                {insert}
              </Picked>
            ) : null}
          </div>
        ) : null}

        {typed ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
            <Section label="Players">
              {waiting
                ? [0, 1, 2].map((row) => (
                    <li key={`skeleton-${row}`} className="flex min-h-14 items-center gap-3 px-4" aria-hidden>
                      <span className="skeleton-shimmer h-4 w-40 rounded-full" />
                      <span className="skeleton-shimmer ml-auto h-3 w-16 rounded-full" />
                    </li>
                  ))
                : parsed.players.map((hit, index) => {
                    const combo = index === 0 && parsed.combo ? parsed.combo.insert : null;
                    return (
                      <li key={`${hit.name}|${hit.sport}`}>
                        <button
                          type="button"
                          aria-label={combo ? `${hit.name}, ${combo}` : undefined}
                          onClick={() => pick(hit.name, hit.sport || null, combo ?? chosenInsert)}
                          className={rowClass}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-base font-semibold tracking-tight">{hit.name}</span>
                            {combo ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-[#A78BFA]">
                                <SwatchDot name={combo} size="sm" />
                                {combo}
                              </span>
                            ) : null}
                          </span>
                          {combo ? null : (
                            <span className="min-w-0 shrink truncate text-right text-xs text-zinc-500">
                              {[hit.sport, hit.team].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
              {!waiting && typedName && !exact ? (
                <li>
                  <button
                    type="button"
                    onClick={() => pick(typedName, null, chosenInsert)}
                    className={`flex min-h-14 w-full items-center px-4 text-left text-sm font-semibold text-violet-700 hover:bg-violet-500/5 dark:text-[#A78BFA] ${focusRing} focus-visible:ring-inset`}
                  >
                    Use &ldquo;{typedName}&rdquo;
                  </button>
                </li>
              ) : null}
            </Section>

            {inserts.length > 0 ? (
              <Section label="Inserts">
                {inserts.map((name) => (
                  <li key={`insert:${name}`}>
                    <button
                      type="button"
                      aria-label={`${name} insert`}
                      onClick={() => onPickInsert(name)}
                      className={rowClass}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <SwatchDot name={name} />
                        <span className="truncate text-base font-semibold tracking-tight">{name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">Insert</span>
                    </button>
                  </li>
                ))}
              </Section>
            ) : null}

            {sets.length > 0 ? (
              <Section label="Sets">
                {sets.map((name) => (
                  <li key={`set:${name}`}>
                    <button
                      type="button"
                      aria-label={`${name} set`}
                      onClick={() => onPickSet(name)}
                      className={rowClass}
                    >
                      <span className="truncate text-base font-semibold tracking-tight">{name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">Set</span>
                    </button>
                  </li>
                ))}
              </Section>
            ) : null}

            {catalogLoading || catalogRows.length > 0 ? (
              <Section label="Cards">
                {catalogLoading
                  ? [0, 1].map((row) => (
                      <li key={`card-skeleton-${row}`} className="flex min-h-14 items-center gap-3 px-4" aria-hidden>
                        <span className="skeleton-shimmer h-4 w-48 rounded-full" />
                      </li>
                    ))
                  : catalogRows.map((card) => (
                      <li key={`card:${card.id}`}>
                        <button
                          type="button"
                          aria-label={catalogRowLabel(card)}
                          onClick={() => onPickCatalog(card)}
                          className={rowClass}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold tracking-tight">
                              {card.playerName}
                            </span>
                            <span className="block truncate text-xs text-zinc-500">
                              {catalogRowDetail(card)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
              </Section>
            ) : null}
          </div>
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

      {recent.length > 0 ? (
        <div>
          <SectionLabel>Recent</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {recent.map((name) => (
              <Chip key={`recent:${name}`} onClick={() => pick(name, null, null)}>
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
              <Chip key={`owned:${item.name}`} onClick={() => pick(item.name, item.sport || null, null)}>
                {item.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <QuietButton onClick={onStepByStep} className="-ml-3 text-zinc-600 dark:text-zinc-300">
        Or add step by step
      </QuietButton>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-zinc-200/80 last:border-b-0 dark:border-white/5">
      <p className="px-4 pt-2.5 pb-1 text-12 font-medium text-zinc-500">{label}</p>
      <ul className="divide-y divide-zinc-200/80 dark:divide-white/5">{children}</ul>
    </div>
  );
}

function Picked({ label, onClear, children }: { label: string; onClear: () => void; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-violet-600/40 bg-violet-600/10 pl-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className={`grid size-11 place-items-center rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 ${focusRing}`}
      >
        <X className="size-4" aria-hidden />
      </button>
    </span>
  );
}

function catalogRowDetail(card: CatalogCard): string {
  const parallel = card.parallel && card.parallel !== "Base" ? card.parallel : "";
  return [card.yearLabel, card.setBrand, card.cardNumber ? `#${card.cardNumber}` : "", parallel]
    .filter(Boolean)
    .join(" · ");
}

function catalogRowLabel(card: CatalogCard): string {
  return `${card.playerName}, ${catalogRowDetail(card)}`;
}
