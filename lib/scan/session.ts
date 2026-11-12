import type { ConfirmSheetState } from "@/components/scan/confirm-sheet";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import type { ScanMatchResult, ScanRead } from "./match";
import { readRawCardText } from "./raw-text";
import { looksLikeSlabLabel, readSlabLabel } from "./slab-label";

export { HUB_COPY, addCardScanHref, quickCompScanHref, scanPurposeFrom, type ScanPurpose } from "./entry";

/**
 * One scan, from capture to the sheet. Pure: the hub (components/scan/scan-hub.tsx)
 * wires it to the camera, the catalog and the router.
 */

/** What the native scanner sends back (lib/ios/scanner.ts). */
export type ScanCapture = {
  /** OCR lines, top to bottom. */
  lines: string[];
  /** A raw card's back, when the scanner asked for it. */
  backLines: string[] | null;
  /** The straightened crop as a data URL. */
  image: string | null;
  /** The scanner's guess from the shape. Null when it couldn't tell. */
  kind: "card" | "slab" | null;
};

/** The scanner's slab or card call wins; with no call, a label-looking read is a slab. */
export function scanReadFrom(capture: ScanCapture, directory: readonly IndexedDirectoryPlayer[]): ScanRead {
  const slab = capture.kind === "slab" || (capture.kind === null && looksLikeSlabLabel(capture.lines));
  if (slab) return { kind: "slab", label: readSlabLabel(capture.lines) };
  return {
    kind: "raw",
    front: readRawCardText(capture.lines, directory),
    back: capture.backLines ? readRawCardText(capture.backLines, directory, { side: "back" }) : null,
  };
}

/** Null result: the search itself failed. Offline says so on the sheet. */
export function sheetStateFrom(result: ScanMatchResult | null, online: boolean): ConfirmSheetState {
  if (!result) return { kind: "none", offline: !online };
  if (result.matches.length === 0) return { kind: "none", offline: false };
  return { kind: "ready", matches: result.matches };
}
