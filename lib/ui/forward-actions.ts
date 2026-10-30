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
 * Taps on a server-drawn screen made before its provider has loaded. Each is
 * held in order and replayed once the provider is ready, so a like, a follow
 * or a save is never dropped or run against a half-loaded provider.
 */
export class ActionQueue {
  private held: (() => void)[] = [];
  private isOpen = false;

  get open(): boolean {
    return this.isOpen;
  }

  /** Runs `call` now if open, else once open. Resolves with its result either way. */
  run<R>(call: () => R): Promise<Awaited<R>> {
    if (this.isOpen) return Promise.resolve(call()) as Promise<Awaited<R>>;
    return new Promise<Awaited<R>>((resolve, reject) => {
      this.held.push(() => {
        try {
          Promise.resolve(call()).then((value) => resolve(value as Awaited<R>), reject);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /** The provider is ready: replay what was held, in order, and run later calls at once. */
  flush(): void {
    this.isOpen = true;
    const held = this.held;
    this.held = [];
    for (const call of held) call();
  }
}

/**
 * A provider's value as first seen, with every function calling the live
 * provider. A server-drawn screen reads this while the provider still loads
 * and redraws; none of that changes what the screen shows, so its rows don't
 * redraw with it. Functions named in `queued` change data: until the queue
 * opens they wait for it, then run against the live provider. The rest are
 * reads and answer from the live provider at once.
 */
export function forwardActions<T extends object>(
  first: T,
  latest: () => T,
  queue: ActionQueue,
  queued: ReadonlySet<string>,
): T {
  const forwarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    if (typeof value !== "function") {
      forwarded[key] = value;
      continue;
    }
    const call = (...args: unknown[]) => (latest()[key as keyof T] as (...a: unknown[]) => unknown)(...args);
    forwarded[key] = queued.has(key) ? (...args: unknown[]) => (queue.open ? call(...args) : queue.run(() => call(...args))) : call;
  }
  return forwarded as T;
}
