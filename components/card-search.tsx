"use client";

import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { catalogLabel, searchCatalog, type CatalogCard } from "@/lib/card-catalog";

export function CardSearch({ onSelect }: { onSelect: (card: CatalogCard) => void }) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query.trim());
  const results = deferred.length >= 1 ? searchCatalog(deferred) : [];
  const showList = open && deferred.length >= 1;

  useEffect(() => {
    setActive(0);
  }, [deferred]);

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

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || results.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = results[active] ?? results[0];
      if (pick) choose(pick);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

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
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
          placeholder="Player, year, or set"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
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
      <p className="mt-1.5 text-xs text-zinc-500">Pick a match to fill the fields below, or enter details manually.</p>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-zinc-500">No matches — fill in the form below</li>
          ) : (
            results.map((card, index) => {
              const selected = index === active;
              return (
                <li key={card.id} role="option" id={`${listId}-${card.id}`} aria-selected={selected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(card)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                      selected ? "bg-violet-500/10" : "hover:bg-zinc-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{card.playerName}</span>
                    <span className="truncate text-xs text-zinc-500">{catalogLabel(card)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </section>
  );
}
