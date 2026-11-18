/**
 * A light tick under a press on the Collection tab (lanes, chips, share, a
 * long-pressed tile). Only where the browser can vibrate, never with Reduce
 * Motion on, and never before the page has been touched.
 */
export function pressTick(ms = 8): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch {
    // Not supported. Nothing to do.
  }
}
