/**
 * Motion for the landing showcase and the onboarding intro. Web Animations
 * only (no motion library), transform and opacity only, one easing.
 */

/** The brand easing. Every entrance and swap uses it. */
export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** A chapter's one scroll-triggered reveal. */
export const REVEAL_MS = 400;

/** True when the reader asked for less motion. False on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** True when the browser can run element.animate(). */
export function canAnimate(node: Element | null | undefined): node is HTMLElement {
  return Boolean(node) && typeof (node as HTMLElement).animate === "function";
}

/** Fade and rise in, once. The node's own styles stay untouched after. */
export function rise(node: Element | null | undefined, { delay = 0, distance = 16, duration = REVEAL_MS } = {}) {
  if (!canAnimate(node)) return null;
  return node.animate(
    [
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration, delay, easing: EASE, fill: "backwards" },
  );
}

/**
 * Calls `onChange(true)` when at least `threshold` of `node` is on screen and
 * the tab is visible, `onChange(false)` when either stops. Returns a stop.
 * Without IntersectionObserver it reports visible once, so demos still play.
 */
export function watchVisible(node: Element, onChange: (visible: boolean) => void, threshold = 0.35): () => void {
  let inView = false;
  let shown: boolean | null = null;
  const report = () => {
    const next = inView && (typeof document === "undefined" || document.visibilityState !== "hidden");
    if (next === shown) return;
    shown = next;
    onChange(next);
  };
  const onVisibility = () => report();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        inView = entry.isIntersecting && entry.intersectionRatio >= threshold * 0.99;
        report();
      },
      { threshold: [0, threshold] },
    );
    observer.observe(node);
  } else {
    inView = true;
    report();
  }
  return () => {
    observer?.disconnect();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** "$412". Whole dollars, tabular in the markup. */
export function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Counts `node`'s text from `from` to `to` with the brand curve. Writes the
 * DOM directly, so nothing re-renders per frame. Returns a cancel.
 */
export function countUp(
  node: HTMLElement | null,
  from: number,
  to: number,
  { duration = 700, delay = 0, format = dollars }: { duration?: number; delay?: number; format?: (value: number) => string } = {},
): () => void {
  if (!node) return () => {};
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function" || prefersReducedMotion()) {
    node.textContent = format(to);
    return () => {};
  }
  let frame = 0;
  let start = 0;
  let cancelled = false;
  node.textContent = format(from);
  const timer = window.setTimeout(() => {
    const step = (time: number) => {
      if (cancelled) return;
      start ||= time;
      const progress = Math.min(1, (time - start) / duration);
      // The brand curve's shape, close enough for a number: fast start, long settle.
      const eased = 1 - (1 - progress) ** 4;
      node.textContent = format(from + (to - from) * eased);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
  }, delay);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    node.textContent = format(to);
  };
}

/** Cancels every animation in a list; safe on nulls. */
export function cancelAll(animations: (Animation | null | undefined)[]) {
  for (const animation of animations) {
    try {
      animation?.cancel();
    } catch {
      // Already gone with its node.
    }
  }
}

/** Runs `run` once, the first time `node` is visible (see watchVisible). Returns a stop. */
export function onceVisible(node: Element, run: () => void, threshold = 0.35): () => void {
  let fired = false;
  let stop: (() => void) | null = null;
  stop = watchVisible(
    node,
    (visible) => {
      if (!visible || fired) return;
      fired = true;
      // The observer may report before watchVisible has returned its stop.
      if (stop) stop();
      run();
    },
    threshold,
  );
  if (fired) stop();
  return () => stop?.();
}
