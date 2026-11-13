"use client";

import { useSyncExternalStore } from "react";
import { CardForm } from "@/components/card-form";
import { peekScan, readScanMatch } from "@/lib/capture";
import type { ScanHandoff } from "@/lib/scan/handoff";

/** The handoff never changes while this page is open, so there is nothing to subscribe to. */
function subscribe() {
  return () => {};
}

/**
 * Add card for a scan. The match (with any cert number) lives in this tab's
 * sessionStorage, which the server can't read, so the server paints a
 * skeleton and the form mounts with the match on the client. A missing or
 * expired handoff opens the usual Add card.
 */
export function ScanAddCard({ scanId }: { scanId: string }) {
  const handoff = useSyncExternalStore<ScanHandoff | null | undefined>(
    subscribe,
    () => readScanMatch(scanId),
    () => undefined,
  );
  const photo = useSyncExternalStore(subscribe, peekScan, () => null);
  if (handoff === undefined) return <ScanAddSkeleton />;
  return <CardForm key={scanId} guided initialScan={handoff} initialPhoto={handoff ? photo : null} />;
}

function ScanAddSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your card" className="mx-auto w-full max-w-lg space-y-5 py-2">
      <div className="skeleton-shimmer h-7 w-40 rounded-md" />
      <div className="skeleton-shimmer mx-auto aspect-[5/7] w-40 rounded-2xl" />
      <div className="space-y-3">
        <div className="skeleton-shimmer h-12 rounded-xl" />
        <div className="skeleton-shimmer h-12 rounded-xl" />
        <div className="skeleton-shimmer h-12 rounded-xl" />
      </div>
    </div>
  );
}
