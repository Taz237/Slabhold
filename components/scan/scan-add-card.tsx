"use client";

import { useSyncExternalStore } from "react";
import { CardForm } from "@/components/card-form";
import { readScanMatch } from "@/lib/capture";
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
  if (handoff === undefined) return <ScanAddSkeleton />;
  return <CardForm key={scanId} guided initialScan={handoff} />;
}

function ScanAddSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your card" className="mx-auto w-full max-w-lg space-y-5 py-2">
      <div className="h-7 w-40 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
      <div className="mx-auto aspect-[5/7] w-40 rounded-2xl bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
      <div className="space-y-3">
        <div className="h-12 rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
        <div className="h-12 rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
        <div className="h-12 rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
      </div>
    </div>
  );
}
