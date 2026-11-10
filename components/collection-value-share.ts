"use client";

import type { RangeId } from "@/lib/chart/range";
import { collectionValueImagePath, collectionValueShareText } from "@/lib/share/collection-value";
import { shareImage } from "@/lib/share/share-image";

/**
 * Share the collection chart image for one range, through shareImage: the
 * iPhone share sheet in the app, the browser's sheet, open or download elsewhere.
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
  await shareImage({
    blob,
    filename: "slabhold-collection.png",
    title: collectionValueShareText(),
    src,
    source: "collection",
  });
}
