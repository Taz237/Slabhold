"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function LoadMore({
  hasMore,
  loading,
  failed = false,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  /** When the last page failed, stay put until the reader taps Try again. */
  failed?: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || loading || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [failed, hasMore, loading, onLoadMore]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={ref} className="px-4 py-4 text-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading || !hasMore}
        className="text-sm font-semibold text-violet-700 disabled:opacity-60 dark:text-violet-300"
      >
        {loading ? "Loading…" : failed ? "Try again" : "Load more"}
      </button>
    </div>
  );
}

/** Loading and failed state for a Load more that calls `load`. One call at a time. */
export function useLoadMore(load: () => Promise<void>) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const run = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    void load()
      .catch(() => setFailed(true))
      .finally(() => {
        busy.current = false;
        setLoading(false);
      });
  }, [load]);
  return { loading, failed, run };
}
