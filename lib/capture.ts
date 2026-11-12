import { parseScanHandoff, type ScanHandoff } from "@/lib/scan/handoff";

const SCAN_KEY = "cardflip.scan";
const COMPOSE_KEY = "cardflip.compose";
const SCAN_MATCH_KEY = "cardflip.scan-match";

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function saveScan(dataUrl: string) {
  try {
    storage()?.setItem(SCAN_KEY, dataUrl);
  } catch {
    // A blocked store must not crash the scan handoff.
  }
}

/** The scan photo without taking it, so a render can read it more than once. */
export function peekScan(): string | null {
  try {
    return storage()?.getItem(SCAN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function takeScan() {
  try {
    const store = storage();
    if (!store) return null;
    const value = store.getItem(SCAN_KEY);
    if (value) store.removeItem(SCAN_KEY);
    return value;
  } catch {
    return null;
  }
}

export function saveCompose(dataUrl: string) {
  try {
    storage()?.setItem(COMPOSE_KEY, dataUrl);
  } catch {
    // A blocked store must not crash the compose handoff.
  }
}

export function takeCompose() {
  try {
    const store = storage();
    if (!store) return null;
    const value = store.getItem(COMPOSE_KEY);
    if (value) store.removeItem(COMPOSE_KEY);
    return value;
  } catch {
    return null;
  }
}

/** The last handoff read or saved in this tab, so every render gets the same object. */
let scanMatch: ScanHandoff | null = null;

/** The scan's chosen match for Add card. Session only, never a URL: it can hold a cert number. */
export function saveScanMatch(handoff: ScanHandoff) {
  scanMatch = handoff;
  try {
    storage()?.setItem(SCAN_MATCH_KEY, JSON.stringify(handoff));
  } catch {
    // Blocked storage: the in-memory copy still carries this tab to Add card.
  }
}

/** The handoff for this scan id, or null. Kept until clearScanMatch, so a reload still has it. */
export function readScanMatch(id: string): ScanHandoff | null {
  if (scanMatch?.id === id) return scanMatch;
  try {
    const parsed = parseScanHandoff(storage()?.getItem(SCAN_MATCH_KEY) ?? null);
    if (parsed?.id !== id) return null;
    scanMatch = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the handoff, cert included, once the card is saved or the scan is abandoned. */
export function clearScanMatch() {
  scanMatch = null;
  try {
    storage()?.removeItem(SCAN_MATCH_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
