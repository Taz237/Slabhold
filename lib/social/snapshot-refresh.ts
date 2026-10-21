/**
 * One site-snapshot load at a time. A slower load waits for the newer one
 * and does not apply its own result, so Home cannot become ready on a
 * post-only snapshot that an older request was still holding.
 */
export function createSnapshotRefresher<T>() {
  let serial = 0;
  let latest: Promise<void> = Promise.resolve();

  return async function refresh(load: () => Promise<T>, apply: (value: T) => void): Promise<void> {
    const mine = ++serial;
    const task = (async () => {
      const value = await load();
      if (mine !== serial) return;
      apply(value);
    })();
    latest = task;
    try {
      await task;
    } catch (error) {
      if (mine === serial) throw error;
    }
    if (mine !== serial) await latest;
  };
}

/** Home (and the rest of the app) may render only after a full snapshot is in memory. */
export function shouldMarkSnapshotReady(fullSnapshotLoaded: boolean) {
  return fullSnapshotLoaded;
}
