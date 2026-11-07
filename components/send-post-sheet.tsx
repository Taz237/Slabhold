"use client";

import { SheetLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";

/**
 * Send a post in a DM. The sheet only draws after a tap on Send, so it is its
 * own chunk (components/send-post-sheet-view.tsx), fetched on the tap.
 */
export const SendPostSheet = lazyPart(
  () => import("@/components/send-post-sheet-view").then((mod) => mod.SendPostSheetView),
  null,
  { name: "send-post-sheet", failed: SheetLoadFailed },
);
