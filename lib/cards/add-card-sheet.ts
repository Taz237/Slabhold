/**
 * The Add card sheet: two tiles, Scan and Upload photo, over a blurred,
 * dimmed screen. Pure, so the sheet and its tests share one source.
 */

export const ADD_SHEET_COPY = {
  title: "Add card",
  scan: "Scan",
  upload: "Upload photo",
  close: "Close",
} as const;

export type AddSheetTile = "scan" | "upload";

/**
 * Where a tile goes. In the iOS app with the scanner on, both read the card
 * on the phone (/scan opens the camera or the library). Anywhere else the
 * sheet opens the photo picker itself, so the tap that opens it is the user's
 * own tap (iOS Safari only opens a file picker from one), then Add card.
 */
export type AddSheetRoute = { kind: "scanner"; href: string } | { kind: "picker"; source: "camera" | "library" };

export function addSheetRoute(tile: AddSheetTile, env: { native: boolean; scanner: boolean }): AddSheetRoute {
  if (env.native && env.scanner) return { kind: "scanner", href: tile === "scan" ? "/scan" : "/scan?start=library" };
  return { kind: "picker", source: tile === "scan" ? "camera" : "library" };
}

/** /scan?start=library opens the library instead of the camera. Anything else is the camera. */
export function scanStartFrom(value: string | string[] | undefined): "camera" | "library" {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "library" ? "library" : "camera";
}

/**
 * A plain click opens the sheet. Cmd, Ctrl, Shift or a middle click keep the
 * browser's own new-tab behavior, which goes straight to /cards/new.
 */
export function opensAddSheet(event: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}): boolean {
  if (event.defaultPrevented) return false;
  if ((event.button ?? 0) !== 0) return false;
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

type Listener = () => void;
const listeners = new Set<Listener>();
let open = false;

/** One sheet for the whole app: any Add card button opens it. */
export function openAddCardSheet(): void {
  if (open) return;
  open = true;
  for (const listener of listeners) listener();
}

export function closeAddCardSheet(): void {
  if (!open) return;
  open = false;
  for (const listener of listeners) listener();
}

export function addCardSheetOpen(): boolean {
  return open;
}

export function subscribeAddCardSheet(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a host is mounted to show the sheet. Without one, Add card links just navigate. */
export function addCardSheetHosted(): boolean {
  return listeners.size > 0;
}
