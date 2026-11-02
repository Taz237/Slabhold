import { afterFirstIdle } from "@/lib/ui/idle";

/*
 * Signed-out Home's links don't prefetch on sight. These warm /signup and
 * /login early anyway: on the reader's first sign of life on the page, or a
 * few seconds after the page has loaded and gone idle, whichever comes first.
 * A first tap is then as quick as a prefetched link, and none of it is in the
 * way of the first paint.
 */

/** Any of these, anywhere on the page, is the first interaction. */
export const FIRST_INTERACTION_EVENTS = ["scroll", "pointerdown", "pointermove", "keydown", "touchstart"] as const;

/** The fallback waits this long after load and the first idle moment. */
export const WARM_FALLBACK_MS = 3000;

const LISTEN = { capture: true, passive: true, once: true } as const;

export type WarmHost = {
  document: { readyState: string };
  addEventListener: (type: string, listener: () => void, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: string, listener: () => void, options?: EventListenerOptions | boolean) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Runs `warm` once, on the first interaction or the fallback. Returns a cancel. */
export function warmOnFirstInteraction(warm: () => void, host: WarmHost = window as unknown as WarmHost): () => void {
  let done = false;
  let cancelIdle: (() => void) | null = null;
  let timer: number | null = null;

  const stop = () => {
    done = true;
    for (const type of FIRST_INTERACTION_EVENTS) host.removeEventListener(type, fire, LISTEN);
    host.removeEventListener("load", afterLoad);
    cancelIdle?.();
    if (timer !== null) host.clearTimeout(timer);
  };
  function fire() {
    if (done) return;
    stop();
    warm();
  }
  function afterLoad() {
    if (done) return;
    cancelIdle = afterFirstIdle(() => {
      if (!done) timer = host.setTimeout(fire, WARM_FALLBACK_MS);
    }, host);
  }

  for (const type of FIRST_INTERACTION_EVENTS) host.addEventListener(type, fire, LISTEN);
  if (host.document.readyState === "complete") afterLoad();
  else host.addEventListener("load", afterLoad, { once: true });
  return stop;
}

type Prefetcher = { prefetch: (href: string) => void };

/**
 * Keyed by the prefetch function: useRouter() hands each component its own
 * wrapper object, but they all share the app router's prefetch.
 */
const warmed = new WeakMap<Prefetcher["prefetch"], Set<string>>();

/** router.prefetch(href), at most once per app router and href. */
export function prefetchOnce(router: Prefetcher | null, href: string) {
  if (!router) return;
  let seen = warmed.get(router.prefetch);
  if (!seen) warmed.set(router.prefetch, (seen = new Set()));
  if (seen.has(href)) return;
  seen.add(href);
  router.prefetch(href);
}
