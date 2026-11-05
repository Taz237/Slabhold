import { isNativeApp, loadNative } from "@/lib/ios/platform";

export type PhotoSource = "camera" | "library";

/** In the iOS app, the native camera or photo picker. Null on Cancel; a readable Error otherwise. */
export async function pickNativePhoto(source: PhotoSource): Promise<File | null> {
  return (await loadNative()).pickPhoto(source);
}

/** True when Add card should use the native picker instead of a file input. */
export function usesNativePicker(): boolean {
  return isNativeApp();
}
