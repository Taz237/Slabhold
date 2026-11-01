"use client";

import type { ComponentProps } from "react";
import type { CardAddedPanel } from "@/components/card-added-panel";
import type { CompsList } from "@/components/comps-list";
import { lazyPart } from "@/lib/ui/lazy-part";

/** A chunk that would not load: ReadRetry's look, compact, in the section's spot. */
export function PartLoadFailed({ retry }: { retry: () => void }) {
  return (
    <div data-read-retry="" className="py-4 text-center text-sm">
      <p className="text-zinc-500">Couldn&apos;t load this.</p>
      <button
        type="button"
        onClick={retry}
        className="mt-2 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 font-bold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Card page parts that never draw in the first paint, each from its own chunk.
 * The sales list waits for the sold prices to come back. The "Added" panel
 * only shows after Add card, which fetches it while the save runs.
 */
export const LazyCompsList = lazyPart<ComponentProps<typeof CompsList>>(
  () => import("@/components/comps-list").then((mod) => mod.CompsList),
  null,
  { name: "comps-list", failed: PartLoadFailed },
);

export const LazyCardAddedPanel = lazyPart<ComponentProps<typeof CardAddedPanel>>(
  () => import("@/components/card-added-panel").then((mod) => mod.CardAddedPanel),
  null,
  { name: "card-added-panel" },
);

/** Fetch the "Added" panel's chunk ahead of the card page that shows it. */
export function preloadCardAddedPanel() {
  LazyCardAddedPanel.warm();
}

/** Fetch the sales list's chunk while the sold prices load. */
export function preloadCompsList() {
  LazyCompsList.warm();
}
