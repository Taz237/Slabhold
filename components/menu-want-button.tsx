"use client";

import type { ComponentProps, ComponentType } from "react";
import { Star } from "lucide-react";
import type { WantButton } from "@/components/want-button";
import { lazyPart } from "@/lib/ui/lazy-part";

type WantButtonProps = ComponentProps<typeof WantButton>;

/**
 * The Want control's spot while its chunk loads: the same box, icon and words
 * as the loaded "Add to want list" chip (which is also how the real one starts,
 * before its want-list read lands), but disabled, so it is never a dead tap.
 */
export function WantButtonPending() {
  return (
    <div className="relative">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label="Add to want list"
        className="inline-flex min-h-11 max-w-[12rem] items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-left text-sm font-semibold leading-5 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
      >
        <Star className="h-4 w-4 shrink-0" />
        Add to want list
      </button>
    </div>
  );
}

/**
 * The Want slot when its chunk would not load, even after its own retry: one
 * chip in the placeholder's box, so the open menu doesn't jump. Its props stay
 * `{ retry }` (lazyPart passes the part's props too; they are not needed here).
 */
export function WantButtonFailed({ retry }: { retry: () => void }) {
  return (
    <div className="relative">
      <span aria-live="polite" className="sr-only">
        Couldn&apos;t load this.
      </span>
      <button
        type="button"
        onClick={retry}
        aria-label="Try again"
        className="inline-flex min-h-11 max-w-[12rem] items-center whitespace-nowrap rounded-full bg-zinc-100 px-3 py-1.5 text-left text-sm font-semibold leading-5 text-violet-600 outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-violet-600 active:scale-[0.98] motion-reduce:transition-none dark:bg-white/10 dark:text-violet-400 dark:focus-visible:ring-violet-400"
      >
        <span aria-hidden="true">Couldn&apos;t load ·&nbsp;</span>Try again
      </button>
    </div>
  );
}

/** The ⋯ menu's Want control from `load`: the placeholder until it lands, a compact Try again if it can't. */
export function menuWantButton(load: () => Promise<ComponentType<WantButtonProps>>) {
  return lazyPart<WantButtonProps>(load, WantButtonPending, { name: "want-button", failed: WantButtonFailed });
}

/** Only in the card page's ⋯ menu, so it is its own chunk (the public card keeps it in the page). */
export const MenuWantButton = menuWantButton(() =>
  import("@/components/want-button").then((mod) => mod.WantButton),
);
