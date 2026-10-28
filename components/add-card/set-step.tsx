"use client";

import { useState } from "react";
import { QuietButton, focusRing } from "@/components/add-card/flow-ui";
import { SET_PARALLEL_HINT, SearchSelect } from "@/components/search-select";
import { SETS, optionsWithCurrent, sortSetNames } from "@/lib/card-options";
import type { SetChoice } from "@/lib/cards/add-flow";

const SOURCE_TAG: Record<SetChoice["source"], string | null> = {
  catalog: "Their card",
  checklist: "Checklist",
  popular: null,
};

/** Which set. Big card-style buttons, then every set in the search sheet. */
export function SetStep({
  value,
  choices,
  loading,
  onPick,
}: {
  value: string;
  choices: readonly SetChoice[];
  loading: boolean;
  onPick: (setBrand: string) => void;
}) {
  const [unsure, setUnsure] = useState(false);
  const [typed, setTyped] = useState("");
  const featured = new Set(choices.map((choice) => choice.name.toLowerCase()));
  const rest = sortSetNames(SETS.filter((name) => !featured.has(name.toLowerCase())));

  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 gap-2">
        {choices.map((choice) => {
          const selected = choice.name.toLowerCase() === value.trim().toLowerCase();
          const tag = SOURCE_TAG[choice.source];
          return (
            <li key={choice.name}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(choice.name)}
                className={`relative flex min-h-[84px] w-full flex-col justify-between overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,transform] duration-150 motion-safe:active:scale-[0.98] motion-reduce:transition-none ${focusRing} ${
                  selected
                    ? "border-violet-600 bg-violet-600/10 ring-1 ring-violet-600"
                    : "border-zinc-200 bg-white hover:border-violet-400 dark:border-white/10 dark:bg-white/[0.04]"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    {choice.maker || "Set"}
                  </span>
                  {tag ? (
                    <span className="rounded-full bg-violet-500/15 px-1.5 font-mono text-[9px] leading-4 font-semibold tracking-wider text-violet-700 uppercase dark:text-[#A78BFA]">
                      {tag}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 text-base leading-tight font-bold tracking-tight">
                  {choice.name}
                </span>
              </button>
            </li>
          );
        })}
        {loading
          ? [0, 1].map((row) => (
              <li key={`skeleton-${row}`} aria-hidden>
                <span className="skeleton-shimmer block h-[84px] rounded-2xl" />
              </li>
            ))
          : null}
      </ul>

      <SearchSelect
        label="More sets"
        value={value && !featured.has(value.toLowerCase()) ? value : ""}
        options={optionsWithCurrent(rest, value && !featured.has(value.toLowerCase()) ? value : "")}
        placeholder="More sets…"
        allowCustom
        customHint={SET_PARALLEL_HINT}
        dataField="setBrand"
        onChange={(name) => {
          if (name.trim()) onPick(name);
        }}
      />

      <div>
        <QuietButton aria-expanded={unsure} onClick={() => setUnsure((open) => !open)}>
          Not sure?
        </QuietButton>
        {unsure ? (
          <div className="mt-2 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 motion-safe:animate-[add-fade_160ms_ease-out] dark:border-white/10 dark:bg-white/[0.03]">
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>The front usually shows the set&apos;s logo and name in a corner.</li>
              <li>The &copy; line on the back names the maker and the year.</li>
            </ul>
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-500">Type it as it reads on the card</span>
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (typed.trim()) onPick(typed);
                }}
                aria-label="Set name"
                placeholder="e.g. Panini Prizm"
                className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5"
              />
            </label>
            <button
              type="button"
              disabled={!typed.trim()}
              onClick={() => onPick(typed)}
              className={`inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40 ${focusRing}`}
            >
              Use this set
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
