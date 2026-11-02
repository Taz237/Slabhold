"use client";

import type { ComponentProps, ComponentType } from "react";
import { Star } from "lucide-react";
import type { WantButton } from "@/components/want-button";
import { PartLoadFailed } from "@/components/part-load-failed";
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

/** The ⋯ menu's Want control from `load`: the placeholder until it lands, Try again if it can't. */
export function menuWantButton(load: () => Promise<ComponentType<WantButtonProps>>) {
  return lazyPart<WantButtonProps>(load, WantButtonPending, { name: "want-button", failed: PartLoadFailed });
}

/** Only in the card page's ⋯ menu, so it is its own chunk (the public card keeps it in the page). */
export const MenuWantButton = menuWantButton(() =>
  import("@/components/want-button").then((mod) => mod.WantButton),
);
