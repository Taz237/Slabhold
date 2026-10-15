import { formatDate, money } from "@/lib/format";
import type { CompListing } from "@/lib/types";

export function CompsList({ comps }: { comps: CompListing[] }) {
  if (!comps.length) {
    return <p className="text-sm text-zinc-500">No recent sold listings yet.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
      {comps.map((comp) => (
        <li key={comp.id} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {comp.title}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {comp.platform} sold · {comp.condition} · {formatDate(comp.soldDate)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium tabular-nums">
              {money(comp.soldPrice, true)}
            </p>
            <p className="text-[11px] text-zinc-500">
              {comp.shipping ? `+${money(comp.shipping, true)} ship` : "Free ship"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
