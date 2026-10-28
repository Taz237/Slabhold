import { soldFreshnessLabel } from "@/lib/comps/freshness";

/** " · Newest sale Sep 30 · checked 7 hours ago" after the sold list sale count. */
export function SoldFreshness({
  comps,
  fetchedAt,
  now,
}: {
  comps: readonly { soldDate?: string | null }[];
  fetchedAt: string | null | undefined;
  now?: number;
}) {
  const label = soldFreshnessLabel(comps, fetchedAt, now);
  return label ? <>{` · ${label}`}</> : null;
}
