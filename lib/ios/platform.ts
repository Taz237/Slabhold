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

type SplashBridge = { Plugins?: { SplashScreen?: { hide?: (options: { fadeOutDuration: number }) => unknown } } };

/**
 * Hides the launch splash straight through the bridge, so the app shows as
 * soon as the page boots instead of after the native chunk downloads.
 */
export function hideSplash(): void {
  try {
    const bridge = (window as Window & { Capacitor?: SplashBridge }).Capacitor;
    const hidden = bridge?.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 200 });
    Promise.resolve(hidden).catch(() => {});
  } catch {
    // No bridge: the native shell hides it, or launchShowDuration does.
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
