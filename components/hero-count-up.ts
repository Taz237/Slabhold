import { money } from "@/lib/format";

/**
 * The collection headline's one count-up, ≤ 400 ms on the brand curve (an
 * ease-out quint is close enough), written straight to its text node so
 * nothing re-renders. Its own small chunk: the hero preloads it on load and
 * only needs it when values land, after a network round trip. Returns a
 * cancel that leaves the exact value, or null when it does not run (reduced
 * motion, a hidden tab, no number yet, under 1¢ to count).
 */
export function heroCountUp(node: HTMLElement, from: number, to: number, ms = 400): (() => void) | null {
  const text = node.firstChild;
  if (
    text?.nodeType !== 3 ||
    !(from > 0) ||
    Math.abs(to - from) < 0.01 ||
    document.visibilityState === "hidden" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return null;
  }
  node.setAttribute("aria-live", "off");
  let start = -1;
  let frame = 0;
  const step = (time: number) => {
    if (start < 0) start = time;
    const t = Math.min(1, (time - start) / ms);
    text.nodeValue = money(from + (to - from) * (1 - (1 - t) ** 5));
    if (t < 1) frame = window.requestAnimationFrame(step);
    else node.setAttribute("aria-live", "polite");
  };
  text.nodeValue = money(from);
  frame = window.requestAnimationFrame(step);
  return () => {
    window.cancelAnimationFrame(frame);
    text.nodeValue = money(to);
  };
}
