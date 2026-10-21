"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  catalogLabel,
  resolveCatalogSearch,
  type CatalogCard,
} from "@/lib/card-catalog";
import { parseManualPrefill } from "@/lib/card-search-query";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export type ManualPrefill = {
  playerName: string;
  yearLabel: string;
  cardNumber: string;
};

type RpcRow = {
  id: string;
  player: string;
  year_label: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel: string | null;
  sport: string | null;
};

function rowToCard(row: RpcRow): CatalogCard {
  return {
    id: row.id,
    playerName: row.player,
    yearLabel: row.year_label ?? "",
    setBrand: row.set_name ?? "",
    cardNumber: row.card_number ?? "",
    sport: row.sport ?? "",
    parallel: row.parallel || "Base",
  };
}

async function searchRemote(
  query: string,
  signal: AbortSignal,
): Promise<CatalogCard[] | null> {
  const supabase = createSupabaseBrowser();
  if (!supabase) return null;

  const builder = supabase.rpc("search_cards", {
    q: query,
    max_results: 20,
  });

  const withAbort =
    typeof (builder as { abortSignal?: (s: AbortSignal) => typeof builder })
      .abortSignal === "function"
      ? (
          builder as { abortSignal: (s: AbortSignal) => typeof builder }
        ).abortSignal(signal)
      : builder;

  const { data, error } = await withAbort;
  if (signal.aborted) return null;
  if (error) {
    console.warn("search_cards rpc failed, using local fallback", error.message);
    return null;
  }
  return ((data as RpcRow[]) ?? []).map(rowToCard);
}

export function CardSearch({
  onSelect,
  onManual,
}: {
  onSelect: (card: CatalogCard) => void;
  onManual: (prefill: ManualPrefill) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(false);

  const showList = open && query.trim().length >= 1;
  // results + always-present manual row
  const optionCount = results.length + 1;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const id = ++requestId.current;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const remote = await searchRemote(q, controller.signal);
        if (controller.signal.aborted || id !== requestId.current) return;
        setResults(resolveCatalogSearch(q, remote, 20));
      } catch {
        if (controller.signal.aborted || id !== requestId.current) return;
        setResults(resolveCatalogSearch(q, null, 20));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query, results]);

  useEffect(() => {
    function onPointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!rootRef.current || !target || rootRef.current.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, []);

  function choose(card: CatalogCard) {
    onSelect(card);
    setQuery("");
    setOpen(false);
  }

  function chooseManual() {
    onManual(parseManualPrefill(query));
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!showList) {
        if (query.trim().length >= 1) setOpen(true);
        return;
      }
      if (active >= results.length) chooseManual();
      else {
        const pick = results[active] ?? results[0];
        if (pick) choose(pick);
        else chooseManual();
      }
      return;
    }
    if (!showList) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (query.trim().length >= 1) setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + optionCount) % optionCount);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const manualSelected = active === results.length || results.length === 0;

  return (
    <section className="relative" ref={rootRef}>
      <p className="mb-1.5 text-sm text-zinc-500">Search cards</p>
      <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList
              ? active < results.length && results[active]
                ? `${listId}-${results[active].id}`
                : `${listId}-manual`
              : undefined
          }
          placeholder="Player, year, set, or #number"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" aria-label="Searching" />
        ) : null}
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>
      <p className="mt-1.5 text-xs text-zinc-500">
        Pick a match to fill the fields below, or enter details manually.
      </p>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-zinc-500">Searching…</li>
          ) : null}
          {results.map((card, index) => {
            const selected = index === active;
            return (
              <li key={card.id} role="option" id={`${listId}-${card.id}`} aria-selected={selected}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(card)}
                  className={`flex w-full px-3 py-2.5 text-left text-sm ${
                    selected ? "bg-violet-500/10" : "hover:bg-zinc-100 dark:hover:bg-white/5"
                  }`}
                >
                  <span className="text-zinc-900 dark:text-zinc-100">{catalogLabel(card)}</span>
                </button>
              </li>
            );
          })}
          <li
            role="option"
            id={`${listId}-manual`}
            aria-selected={manualSelected}
            className={results.length > 0 ? "mt-1 border-t border-zinc-200 dark:border-white/10" : undefined}
          >
            <button
              type="button"
              onMouseEnter={() => setActive(results.length)}
              onClick={chooseManual}
              className={`flex min-h-11 w-full items-center px-3 py-2.5 text-left text-sm font-medium ${
                manualSelected
                  ? "bg-violet-500/10 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
              }`}
            >
              Not seeing your card? Add it manually
            </button>
          </li>
        </ul>
      ) : null}
    </section>
  );
}
