"use client";

import { useEffect, useRef } from "react";

export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={ref} className="px-4 py-4 text-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading || !hasMore}
        className="text-sm font-semibold text-violet-700 disabled:opacity-60 dark:text-violet-300"
      >
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
