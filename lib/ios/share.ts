import { isNativeApp, loadNative } from "@/lib/ios/platform";
import type { NativeShareData } from "@/lib/share/sheet";

/** The iOS share sheet, loaded on the tap. Cancel rejects as an AbortError. */
export async function nativeShare(data: NativeShareData): Promise<void> {
  return (await loadNative()).shareSheet(data);
}

/** The share sheet to use: the app's native one, the browser's, or none. */
export function shareFunction(): ((data: NativeShareData) => Promise<void>) | undefined {
  if (isNativeApp()) return nativeShare;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return undefined;
  return navigator.share.bind(navigator);
}
