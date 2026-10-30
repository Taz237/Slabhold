/** A provider's latest value, for actions that run after render. */
export class LatestValue<T> {
  private value: T;
  constructor(value: T) {
    this.value = value;
  }
  get(): T {
    return this.value;
  }
  set(value: T): void {
    this.value = value;
  }
}

/**
 * A provider's value as first seen, with every action calling the live
 * provider. A server-drawn screen reads this while the provider still loads
 * and redraws; none of that changes what the screen shows, so its rows don't
 * redraw with it, and an action still reaches the current provider.
 */
export function forwardActions<T extends object>(first: T, latest: () => T): T {
  const forwarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    forwarded[key] =
      typeof value === "function"
        ? (...args: unknown[]) => (latest()[key as keyof T] as (...a: unknown[]) => unknown)(...args)
        : value;
  }
  return forwarded as T;
}
