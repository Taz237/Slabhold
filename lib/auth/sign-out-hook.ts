type SignOutHook = () => Promise<void>;

let hook: SignOutHook | null = null;

/**
 * Work that must happen while the session is still valid, such as removing
 * this device's push subscription. One hook, registered by code that loads
 * for signed-in users only.
 */
export function setSignOutHook(next: SignOutHook | null): void {
  hook = next;
}

/** Runs before sign-out. Bounded, so logging out never waits long. */
export async function runSignOutHook(timeoutMs = 400): Promise<void> {
  const current = hook;
  if (!current) return;
  await Promise.race([
    current().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
