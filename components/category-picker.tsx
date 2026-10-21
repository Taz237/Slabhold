"use client";

import { cardCategory, categoryLabel } from "@/lib/card-category";
import type { CardCategory } from "@/lib/types";

const OPTIONS: { id: CardCategory; detail: string }[] = [
  { id: "flipping", detail: "For sale" },
  { id: "pc", detail: "Personal collection" },
];

export function CategoryPicker({
  value,
  onChange,
}: {
  value: CardCategory;
  onChange: (value: CardCategory) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Card category">
      {OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`min-h-14 rounded-2xl border px-3 py-2 text-left ${
              selected
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                : "border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100"
            }`}
          >
            <span className="block text-sm font-bold">{categoryLabel(option.id)}</span>
            <span className={`block text-xs ${selected ? "text-white/75 dark:text-zinc-600" : "text-zinc-500"}`}>
              {option.detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CategoryBadge({ card }: { card: { category?: string | null } }) {
  const category = cardCategory(card);
  const label = categoryLabel(category);
  const pc = category === "pc";
  return (
    <span
      title={label}
      className={`inline-block max-w-full shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        pc
          ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
          : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      }`}
    >
      {label}
    </span>
  );
}
