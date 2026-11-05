import { isNativeApp } from "@/lib/ios/platform";

export type PhotoSource = "camera" | "library";

/** Camera or Photos access was turned off for Slabhold. */
export const PHOTO_ACCESS_ERROR = "Slabhold can't open your photos. Turn on access in Settings, then try again.";

type Picked = { dataUrl?: string; format?: string };

/** "image/jpeg" from a data URL, or from the plugin's format. */
function mimeOf(picked: Picked): string {
  const match = picked.dataUrl?.match(/^data:([^;,]+)[;,]/);
  if (match) return match[1];
  return `image/${picked.format === "jpg" || !picked.format ? "jpeg" : picked.format}`;
}

/** The plugin's data URL as a File, so the form reads it like any upload. */
export function photoFile(picked: Picked): File | null {
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

/** Cancel is "no photo"; turned-off access gets its own message; the rest is thrown. */
export function pickError(error: unknown): "cancelled" | "denied" | "failed" {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  if (/cancel/i.test(message)) return "cancelled";
  if (/denied|access/i.test(message)) return "denied";
  return "failed";
}

/**
 * In the iOS app, the native camera or photo picker. Null on Cancel.
 * DataUrl, not a file path: the page comes from slabhold.app and can't read
 * the app's local files. getPhoto is deprecated in Camera 8 but still ships.
 */
export async function pickNativePhoto(source: PhotoSource): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      saveToGallery: false,
    });
    return photoFile(photo);
  } catch (error) {
    const kind = pickError(error);
    if (kind === "cancelled") return null;
    throw new Error(kind === "denied" ? PHOTO_ACCESS_ERROR : "Couldn't read that photo. Try again.");
  }
}

/** True when Add card should use the native picker instead of a file input. */
export function usesNativePicker(): boolean {
  return isNativeApp();
}
