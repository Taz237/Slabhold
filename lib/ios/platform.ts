/**
 * True inside the Slabhold iOS app (Capacitor's WKWebView), false on the web.
 * Reads the bridge Capacitor injects into every page, so it imports nothing.
 */
type CapacitorBridge = { isNativePlatform?: () => boolean };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  try {
    return bridge?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * The one door to the app's native code (shell, share, haptics, camera), which
 * all lives in lib/ios/native.ts. Call it only behind isNativeApp(): it's a
 * dynamic import, so web pages carry this loader and no plugin code.
 */
export function loadNative() {
  return import("@/lib/ios/native");
}
