"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Users } from "lucide-react";
import { wasScanAdded } from "@/lib/capture";
import { peopleCountsLine, type PeopleCounts } from "@/lib/cards/people-counts";

export type PeopleCountsLoad = (cardId: string) => Promise<PeopleCounts | null>;

async function loadCounts(cardId: string): Promise<PeopleCounts | null> {
  const response = await fetch(`/api/cards/people/counts?id=${encodeURIComponent(cardId)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as Partial<PeopleCounts>;
  if (typeof body.owners !== "number") return null;
  return { owners: body.owners, hunters: typeof body.hunters === "number" ? body.hunters : null };
}

function subscribe() {
  return () => {};
}

/**
 * "4 collectors own this · 2 are hunting it" on the card-added screen, only
 * right after a scan save. Two counts: no names, avatars or lists. Nothing
 * shows on a failure or when nobody else has it.
 */
export function ScanPeopleLine({ cardId, load = loadCounts }: { cardId: string; load?: PeopleCountsLoad }) {
  const scanned = useSyncExternalStore(subscribe, () => wasScanAdded(cardId), () => false);
  const [line, setLine] = useState<{ cardId: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!scanned) return;
    let live = true;
    load(cardId).then(
      (counts) => {
        if (live) setLine({ cardId, text: peopleCountsLine(counts) });
      },
      () => {
        if (live) setLine({ cardId, text: null });
      },
    );
    return () => {
      live = false;
    };
  }, [cardId, load, scanned]);

  if (!scanned) return null;
  if (!line || line.cardId !== cardId) {
    return <span aria-hidden className="mx-auto mt-2 block h-4 w-56 rounded-full skeleton-shimmer" />;
  }
  if (!line.text) return null;
  return (
    <p data-slot="scan-people" className="mt-2 inline-flex items-center gap-1.5 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
      <Users className="size-4 shrink-0 text-zinc-500" strokeWidth={1.5} aria-hidden />
      {line.text}
    </p>
  );
}
