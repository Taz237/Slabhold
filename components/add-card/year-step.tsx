"use client";

import { useState } from "react";
import { Chip, QuietButton, SectionLabel, focusRing } from "@/components/add-card/flow-ui";
import { SearchSelect } from "@/components/search-select";
import type { CatalogCard } from "@/lib/card-catalog";
import { isValidYear, optionsWithCurrent, yearOptionsForSport } from "@/lib/card-options";
import { catalogYears, yearChips } from "@/lib/cards/add-flow";

/**
 * What year. A chip grid of recent seasons, the player's own years first,
 * and "Older…" for the rest. "Not sure?" offers their catalog cards.
 */
export function YearStep({
  sport,
  value,
  catalog,
  catalogLoading,
  onPick,
  onCatalogPick,
}: {
  sport: string;
  value: string;
  catalog: readonly CatalogCard[];
  catalogLoading: boolean;
  onPick: (yearLabel: string) => void;
  onCatalogPick: (card: CatalogCard) => void;
}) {
  const [unsure, setUnsure] = useState(false);
  const theirs = catalogYears(catalog);
  const chips = yearChips(sport);
  const all = yearOptionsForSport(sport);

  return (
    <div className="space-y-5">
      {catalogLoading ? (
        <div aria-hidden>
          <span className="skeleton-shimmer mb-2 block h-3 w-20 rounded-full" />
          <div className="flex gap-2">
            <span className="skeleton-shimmer h-11 w-24 rounded-full" />
            <span className="skeleton-shimmer h-11 w-24 rounded-full" />
          </div>
        </div>
      ) : theirs.length > 0 ? (
        <div>
          <SectionLabel>Their cards</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {theirs.map((year) => (
              <Chip key={`theirs:${year}`} selected={value === year} onClick={() => onPick(year)}>
                {year}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        {theirs.length > 0 ? <SectionLabel>All years</SectionLabel> : null}
        <div className="grid grid-cols-3 gap-2">
          {chips.map((year) => (
            <Chip
              key={year}
              selected={value === year}
              onClick={() => onPick(year)}
              className="w-full px-2 tabular-nums"
            >
              {year}
            </Chip>
          ))}
        </div>
        <div className="mt-3">
          <SearchSelect
            label="Older years"
            value={value && !chips.includes(value) ? value : ""}
            options={value && isValidYear(value) ? optionsWithCurrent(all, value) : all}
            placeholder="Older…"
            allowCustom
            isCustomValid={isValidYear}
            customInvalidHint="Use 2026 or 2023-24"
            inputMode="text"
            onChange={(year) => {
              if (isValidYear(year)) onPick(year);
            }}
          />
        </div>
      </div>

      <div>
        <QuietButton aria-expanded={unsure} onClick={() => setUnsure((open) => !open)}>
          Not sure?
        </QuietButton>
        {unsure ? (
          <div className="mt-2 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 motion-safe:animate-[add-fade_160ms_ease-out] dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Look at the &copy; line on the back. The year printed there is usually the card&apos;s year.
            </p>
            {catalog.length > 0 ? (
              <>
                <p className="text-sm font-semibold">Or pick one of their cards</p>
                <ul className="grid grid-cols-2 gap-2">
                  {catalog.slice(0, 8).map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => onCatalogPick(card)}
                        className={`flex min-h-20 w-full flex-col justify-between rounded-xl border border-zinc-200 bg-gradient-to-br from-violet-600/15 via-transparent to-transparent p-3 text-left hover:border-violet-400 dark:border-white/10 ${focusRing}`}
                      >
                        <span className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                          {card.yearLabel}
                        </span>
                        <span className="mt-1 line-clamp-2 text-sm leading-tight font-semibold">
                          {card.setBrand}
                        </span>
                        <span className="mt-1 text-xs text-zinc-500 tabular-nums">
                          {card.cardNumber ? `#${card.cardNumber}` : "No number"}
                          {card.parallel && card.parallel !== "Base" ? ` · ${card.parallel}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : catalogLoading ? null : (
              <p className="text-sm text-zinc-500">
                We don&apos;t have their cards listed yet, so pick the year from the back. We need it to find prices.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
