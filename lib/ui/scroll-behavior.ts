/** "smooth", or "auto" (an instant jump) when the reader has Reduce Motion on. */
export function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}
