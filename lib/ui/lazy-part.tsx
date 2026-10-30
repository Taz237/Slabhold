"use client";

import { createElement, useSyncExternalStore, type ComponentType } from "react";

/**
 * A client-only component from its own chunk. It draws `fallback` (or
 * nothing) until the chunk is in, then the component. Unlike next/dynamic
 * it never suspends, so a part that was preloaded draws in the same render
 * that first needs it, with no fallback commit and no Suspense reveal delay.
 * The server and hydration always get the fallback.
 */
export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ComponentType<P> | null = null,
) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const listeners = new Set<() => void>();

  function preload(): Promise<ComponentType<P>> {
    pending ??= load().then(
      (component) => {
        loaded = component;
        for (const listener of listeners) listener();
        return component;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    void preload().catch(() => {});
    return () => {
      listeners.delete(listener);
    };
  }

  function LazyPart(props: P) {
    const Component = useSyncExternalStore(
      subscribe,
      () => loaded,
      () => null,
    );
    if (Component) return createElement(Component, props);
    return fallback ? createElement(fallback, props) : null;
  }

  return Object.assign(LazyPart, { preload });
}
