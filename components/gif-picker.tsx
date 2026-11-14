"use client";

import { SheetLoadFailed } from "@/components/part-load-failed";
import type { PostGif } from "@/lib/social/gifs";
import { lazyPart } from "@/lib/ui/lazy-part";

export type GifPickerProps = {
  onPick: (gif: PostGif) => void;
  onClose: () => void;
};

/**
 * The GIPHY search sheet. It only draws after a tap on the GIF button, so it
 * is its own chunk (components/gif-picker-view.tsx), fetched on the tap.
 */
export const GifPicker = lazyPart<GifPickerProps>(
  () => import("@/components/gif-picker-view").then((mod) => mod.GifPickerView),
  null,
  { name: "gif-picker", failed: SheetLoadFailed },
);
