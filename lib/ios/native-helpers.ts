/**
 * Pure helpers for the app's camera, kept out of first load: only
 * lib/ios/native.ts imports them.
 */

/** What the camera plugin hands back, as far as we read it. */
export type PickedPhoto = { dataUrl?: string; format?: string };

/** Camera or Photos access was turned off for Slabhold. */
export const PHOTO_ACCESS_ERROR = "Slabhold can't open your photos. Turn on access in Settings, then try again.";

export const PHOTO_PICK_ERROR = "Couldn't read that photo. Try again.";

/** "image/jpeg" from a data URL, or from the plugin's format. */
function mimeOf(picked: PickedPhoto): string {
  const match = picked.dataUrl?.match(/^data:([^;,]+)[;,]/);
  if (match) return match[1];
  return `image/${picked.format === "jpg" || !picked.format ? "jpeg" : picked.format}`;
}

/** The plugin's data URL as a File, so the form reads it like any upload. */
export function photoFile(picked: PickedPhoto): File | null {
  if (!picked.dataUrl) return null;
  const comma = picked.dataUrl.indexOf(",");
  if (comma < 0) return null;
  const binary = atob(picked.dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const type = mimeOf(picked);
  const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "jpg";
  return new File([bytes], `card.${ext}`, { type });
}

/** Cancel is "no photo"; turned-off access gets its own message. */
export function pickError(error: unknown): "cancelled" | "denied" | "failed" {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  if (/cancel/i.test(message)) return "cancelled";
  if (/denied|access/i.test(message)) return "denied";
  return "failed";
}

/**
 * What pickPhoto throws: null on Cancel, else the user's message. The raw
 * plugin error goes to the console, so a failure like a missing Info.plist key
 * shows up in Xcode instead of hiding behind "Couldn't read that photo".
 */
export function photoPickFailure(error: unknown): Error | null {
  const kind = pickError(error);
  if (kind === "cancelled") return null;
  console.warn("Slabhold photo pick failed:", error);
  return new Error(kind === "denied" ? PHOTO_ACCESS_ERROR : PHOTO_PICK_ERROR);
}

/** Cancel on the iOS share sheet becomes the web's AbortError, so callers treat both alike. */
export function asShareAbort(error: unknown): unknown {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && /cancel/i.test(message)) {
    const abort = new Error(message);
    abort.name = "AbortError";
    return abort;
  }
  return error;
}
