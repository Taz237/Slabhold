/** Wait for the data client up to `ms`. Null when it fails or is too slow: the caller says "can't connect". */
export async function waitForClient<T>(load: () => Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([load().catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
