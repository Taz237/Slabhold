/**
 * The scanner's ways in: the flag, the links and their copy. Kept free of the
 * card readers so Add card and Quick Comp don't load them just to show a button.
 */

/** Add: into the collection. Comp: what it sold for, nothing saved. */
export type ScanPurpose = "add" | "comp";

/**
 * The scanner, off unless exactly "1". NEXT_PUBLIC_ so the entry points can
 * read it; Next inlines it at build, so a toggle needs a redeploy.
 */
export function scannerEnabled(
  env: { NEXT_PUBLIC_SCANNER?: string } = { NEXT_PUBLIC_SCANNER: process.env.NEXT_PUBLIC_SCANNER },
): boolean {
  return env.NEXT_PUBLIC_SCANNER === "1";
}

export const HUB_COPY = {
  addTitle: "Scan a card",
  compTitle: "Scan to comp",
  addBody: "Point your camera at a card or slab. We'll find it and fill it in.",
  compBody: "Snap a card or slab and see what it sold for. Nothing gets added.",
  unlimited: "Scan as many cards as you want.",
  scan: "Scan a card",
  library: "Choose a photo",
  typeIt: "Type it instead",
  findByName: "Find it by name",
  readerSoon: "Card reading is coming to the iPhone app. For now, snap a photo and find the card by name.",
  compReaderSoon: "Card reading is coming to the iPhone app. For now, find the card by name to see sold prices.",
  readFailed: "We couldn't read that one. Try again with the card flat and in good light.",
  cameraOff: "Camera is off for Slabhold",
  cameraOffBody: "Turn the camera on in Settings to scan. You can still choose a photo or type it in.",
  cameraOffManual: "To scan, open the Settings app, tap Slabhold and turn on Camera. You can still choose a photo or type it in.",
  openSettings: "Open Settings",
  addEntry: "Scan a card",
  addEntryBody: "Point your camera at a card or slab",
  compEntry: "Scan a card",
  compEntryBody: "Snap it and see what it sold for",
} as const;

export function scanPurposeFrom(value: string | string[] | undefined): ScanPurpose {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "comp" ? "comp" : "add";
}

/** "Scan a card" at the top of Add card, when the scanner is on. */
export function addCardScanHref(enabled: boolean): string | null {
  return enabled ? "/scan" : null;
}

/** "Scan a card" in Quick Comp, when the scanner is on. */
export function quickCompScanHref(enabled: boolean): string | null {
  return enabled ? "/scan?for=comp" : null;
}
