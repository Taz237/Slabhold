"use client";

import { trackEvent } from "@/lib/analytics";
import type { RangeId } from "@/lib/chart/range";
import { collectionValueImagePath, collectionValueShareText } from "@/lib/share/collection-value";
import { isShareAbort } from "@/lib/share/sheet";
import { isIosDevice, storySaveMethod } from "@/lib/share/story-save";

/**
 * Share the collection chart image for one range. Uses the share sheet with
 * the PNG where the browser allows files, and opens the image otherwise.
 */
export async function shareCollectionValue(range: RangeId): Promise<void> {
  const src = collectionValueImagePath(range);
  let blob: Blob | null = null;
  try {
    const response = await fetch(src, { credentials: "same-origin" });
    blob = response.ok ? await response.blob() : null;
  } catch {
    blob = null;
  }
  if (!blob) {
    window.open(src, "_blank", "noopener");
    return;
  }
  const file = new File([blob], "slabhold-collection.png", { type: "image/png" });
  const method = storySaveMethod({
    canShareFiles: typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }),
    ios: isIosDevice({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
  });
  if (method === "share-files") {
    try {
      await navigator.share({ files: [file], title: collectionValueShareText() });
      trackEvent("share", { source: "collection", method: "image" });
    } catch (error) {
      // The tap's permission ran out while the image loaded: open it instead.
      if (!isShareAbort(error)) window.open(src, "_blank", "noopener");
    }
    return;
  }
  if (method === "open") {
    window.open(src, "_blank", "noopener");
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "slabhold-collection.png";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  trackEvent("share", { source: "collection", method: "image" });
}
