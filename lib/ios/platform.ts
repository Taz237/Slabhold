/**
 * True inside the Slabhold iOS app (Capacitor's WKWebView), false on the web.
 * Reads the bridge Capacitor injects into every page, so it imports nothing:
 * plugin code only ever loads behind this check, by `await import()`.
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
