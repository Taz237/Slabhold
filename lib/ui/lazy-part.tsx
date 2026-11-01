"use client";

import { createElement, useSyncExternalStore, type ComponentType } from "react";

/** After a failed load, a mounted part tries once more this much later. */
export const LAZY_PART_RETRY_MS = 1500;

/**
 * A client-only component from its own chunk. It draws `fallback` (or
 * nothing) until the chunk is in, then the component. Unlike next/dynamic
 * it never suspends, so a part that was preloaded draws in the same render
 * that first needs it, with no fallback commit and no Suspense reveal delay.
 * The server and hydration always get the fallback.
 *
 * A failed load (deploy skew, a flaky network) is reported with
 * console.warn and tried once more while the part is mounted. If that fails
 * too, the part draws `failed`, whose `retry()` loads again. Without
 * `failed` it keeps drawing the fallback, and the next mount tries again.
 */
export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ComponentType<P> | null = null,
  { name = "part", failed = null }: { name?: string; failed?: ComponentType<P & { retry: () => void }> | null } = {},
) {
  /** null: not in yet. A component: in. false: the load and its retry both failed. */
  let shown: ComponentType<P> | null | false = null;
  let pending: Promise<ComponentType<P>> | null = null;
  let trying = false;
  const listeners = new Set<() => void>();

  function publish(next: typeof shown) {
    shown = next;
    for (const listener of listeners) listener();
  }

  function preload(): Promise<ComponentType<P>> {
    pending ??= load().then(
      (component) => {
        publish(component);
        return component;
      },
      (error: unknown) => {
        pending = null;
        console.warn("[lazy-part]", name, error instanceof Error ? error.message : error);
        throw error;
      },
    );
    return pending;
  }

  /** Fetch ahead of need (and `failed`'s retry). A failure is reported, never thrown. */
  function warm() {
    preload().catch(() => {});
  }

  /** Load for whoever is mounted: one automatic retry, then give up. */
  function attempt(again: boolean) {
    trying = true;
    preload().then(
      () => (trying = false),
      () => {
        if (!again && listeners.size) {
          setTimeout(() => (listeners.size ? attempt(true) : (trying = false)), LAZY_PART_RETRY_MS);
          return;
        }
        trying = false;
        if (listeners.size) publish(false);
      },
    );
  }

  function subscribe(listener: () => void) {
    // A fresh mount after giving up gets its own load and retry.
    if (shown === false && !listeners.size) shown = null;
    listeners.add(listener);
    if (shown === null && !trying) attempt(false);
    return () => {
      listeners.delete(listener);
    };
  }

  function LazyPart(props: P) {
    const Component = useSyncExternalStore(
      subscribe,
      () => shown,
      () => null,
    );
    if (Component) return createElement(Component, props);
    if (Component === false && failed) return createElement(failed, { ...props, retry: warm });
    return fallback ? createElement(fallback, props) : null;
  }

  return Object.assign(LazyPart, { preload, warm });
}
