"use client";

import { useEffect, useState } from "react";
import { loadProductData, peekProductData, type ProductRecord } from "@/lib/cards/product-data";

/**
 * The checklist JSON, loaded on first use with a dynamic import.
 * Null until it arrives (or if it fails: the built-in lists still work).
 */
export function useProductData(enabled: boolean): {
  data: readonly ProductRecord[] | null;
  loading: boolean;
} {
  const [data, setData] = useState<readonly ProductRecord[] | null>(peekProductData);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || data) return;
    let live = true;
    loadProductData()
      .then((rows) => {
        if (live) setData(rows);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [enabled, data]);

  return { data, loading: enabled && !data && !failed };
}
