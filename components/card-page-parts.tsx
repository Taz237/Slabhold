"use client";

import type { ComponentProps } from "react";
import type { CardAddedPanel } from "@/components/card-added-panel";
import type { CompsList } from "@/components/comps-list";
import { PartLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";

export { PartLoadFailed };

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
  { name: "card-added-panel", failed: PartLoadFailed },
);

/** Fetch the "Added" panel's chunk ahead of the card page that shows it. */
export function preloadCardAddedPanel() {
  LazyCardAddedPanel.warm();
}

/** Fetch the sales list's chunk while the sold prices load. */
export function preloadCompsList() {
  LazyCompsList.warm();
}
