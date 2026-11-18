import type { UnstableCache } from "@/lib/quick-comp/cache";

/**
 * next/cache `unstable_cache`, the way Next keys it: by the callback's own source text, the key
 * parts, and the arguments the cached function is called with
 * (node_modules/next/dist/server/web/spec-extension/unstable-cache.js: `cb.toString()` + keyParts,
 * then JSON.stringify(args)). A value is stored; a throw is not. A fake that keys by the key parts
 * alone hides the bug where a writer and a reader pass different callbacks and never meet.
 */
export function nextLikeUnstableCache() {
  const store = new Map<string, unknown>();
  const unstable: UnstableCache = (cb, keyParts) => {
    const fixedKey = `${cb.toString()}-${keyParts.join(",")}`;
    return async (...args) => {
      const key = `${fixedKey}-${JSON.stringify(args)}`;
      if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof cb>>;
      const value = await cb(...args);
      store.set(key, value);
      return value;
    };
  };
  return { unstable, store };
}
