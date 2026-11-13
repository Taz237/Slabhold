import type { ConfirmSheetState } from "@/components/scan/confirm-sheet";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import type { ScanMatchResult, ScanRead } from "./match";
import { findPlayers, readRawCardText } from "./raw-text";
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
  /** The border's color name from the photo (pink, red, purple...), read on the phone. Null when unclear. */
  border?: string | null;
  /** Each line's next best readings, same order as `lines`. Only ever used to fill an open field (alternates.ts). */
  alternates?: string[][] | null;
  /** The same for `backLines`. */
  backAlternates?: string[][] | null;
  /** A slab's cert number from its barcode. Only ever the cert, never the card #. */
  cert?: string | null;
};

/** The scanner's slab or card call wins; with no call, a label-looking read is a slab. */
export function scanReadFrom(capture: ScanCapture, directory: readonly IndexedDirectoryPlayer[]): ScanRead {
  const slab = capture.kind === "slab" || (capture.kind === null && looksLikeSlabLabel(capture.lines));
  if (slab) {
    // The label is gold: the line that names a player we know is the player line, wherever it sits.
    // Roster-file players only: a wider-list name never picks which label line is the player's.
    const playerScore = (line: string) => findPlayers([line], directory).find((hit) => !hit.more)?.score ?? 0;
    const label = readSlabLabel(capture.lines, { playerScore });
    // The barcode's cert fills the cert when the label's own wasn't read. It is never the card #.
    if (!label.certNumber && capture.cert) label.certNumber = capture.cert;
    if (label.certNumber && label.cardNumber.replace(/\D/g, "") === label.certNumber.replace(/\D/g, "")) label.cardNumber = "";
    return { kind: "slab", label };
  }
  return {
    kind: "raw",
    front: readRawCardText(capture.lines, directory, { side: "front" }),
    back: capture.backLines ? readRawCardText(capture.backLines, directory, { side: "back" }) : null,
    border: capture.border ?? null,
  };
}

/** Null result: the search itself failed. Offline says so on the sheet. */
export function sheetStateFrom(result: ScanMatchResult | null, online: boolean): ConfirmSheetState {
  if (!result) return { kind: "none", offline: !online };
  if (result.matches.length === 0) return { kind: "none", offline: false };
  return { kind: "ready", matches: result.matches };
}
