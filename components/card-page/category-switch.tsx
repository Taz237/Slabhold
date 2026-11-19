"use client";

import type { CardCategory } from "@/lib/types";

/** Stored values stay `flipping` and `pc`. These are the words on screen. */
const OPTIONS: { id: CardCategory; label: string }[] = [
  { id: "flipping", label: "Open to offers" },
  { id: "pc", label: "Personal collection" },
];

/** Which pile the card sits in, as one quiet row on the owner's card page. */
export function CategorySwitch({ value, onChange }: { value: CardCategory; onChange: (value: CardCategory) => void }) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-full bg-zinc-950/[0.04] p-1 big:grid-cols-1 big:rounded-2xl dark:bg-white/[0.05]"
      role="radiogroup"
      aria-label="Card category"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`hit-44 min-h-9 rounded-full px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none ${
              selected
                ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:bg-zinc-800 dark:text-zinc-50 dark:shadow-none"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
