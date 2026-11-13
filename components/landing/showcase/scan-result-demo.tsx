"use client";

import { useEffect, useRef } from "react";
import { MatchSummary } from "@/components/scan/sheet-parts";
import type { ScanMatch } from "@/lib/scan/match";
import { onceVisible, rise } from "./motion";
import { SAMPLE_SCAN, SAMPLE_SCAN_PHOTO } from "./sample-data";
import { SoldPanel } from "./sold-panel";

const MATCH = SAMPLE_SCAN as unknown as ScanMatch;

/**
 * What a scan ends on: the scan-to-comp sheet for the made-up card. The
 * sheet's own summary row (MatchSummary) over the value panel and its dots.
 * It rises in once; nothing loops.
 */
export default function ScanResultDemo({ run }: { run: number }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    return onceVisible(node, () => void rise(node));
  }, []);

  useEffect(() => {
    if (run > 0) rise(root.current);
  }, [run]);

  return (
    <div ref={root} data-showcase-demo="scan-result" data-scan-demo="" className="h-full rounded-2xl border border-white/[0.08] bg-[#111114] p-4 text-zinc-50">
      <MatchSummary photo={SAMPLE_SCAN_PHOTO} match={MATCH} />
      <SoldPanel className="mt-4" />
    </div>
  );
}
