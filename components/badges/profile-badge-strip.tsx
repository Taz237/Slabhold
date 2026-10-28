import Link from "next/link";
import { Badge, badgeLabel } from "@/components/badges/badge";
import { CATEGORY_COPY, TIER_LABELS } from "@/lib/badges/config";
import { formatPin } from "@/lib/badges/pins";
import type { ProfileBadgeView } from "@/lib/badges/visibility";

/**
 * One row under the stats: up to 3 pins and a "+N" chip. Hidden entirely when
 * badges are off or there are none, so it never leaves an empty box.
 */
export function ProfileBadgeStrip({ view, badgesHref }: { view: ProfileBadgeView; badgesHref: string }) {
  if (view.kind === "hidden") return null;
  if (view.kind === "first") {
    return (
      <Link
        href="/achievements"
        className="mt-3 flex min-h-11 items-center gap-2.5 rounded-2xl border border-dashed border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-600 dark:border-white/15 dark:text-zinc-400"
      >
        <Badge category="collector" tier="bronze" size={32} locked progress={view.progress} label="" />
        <span className="min-w-0 flex-1 truncate">{view.line}</span>
        <span aria-hidden className="text-violet-700 dark:text-[#A78BFA]">
          →
        </span>
      </Link>
    );
  }
  return (
    <section aria-label="Pinned badges" className="mt-2 h-[5.5rem]">
      <ul className="flex h-full items-start gap-1">
        {view.pins.map((badge) => (
          <li key={formatPin(badge)} className="w-[5.25rem] shrink-0">
            <Link
              href={badgesHref}
              aria-label={badgeLabel(badge.category, badge.tier)}
              className="flex flex-col items-center rounded-2xl px-0.5 pt-0.5 text-center focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
            >
              <Badge category={badge.category} tier={badge.tier} size={56} label="" />
              <span className="mt-0.5 w-full truncate text-[11px] leading-4 font-semibold">
                {CATEGORY_COPY[badge.category].label}
              </span>
              <span
                className={`w-full truncate text-[10px] leading-3.5 ${
                  badge.tier === "legendary" ? "text-violet-700 dark:text-[#A78BFA]" : "text-zinc-500"
                }`}
              >
                {TIER_LABELS[badge.tier]}
              </span>
            </Link>
          </li>
        ))}
        {view.more > 0 ? (
          <li className="flex h-[3.625rem] items-center pl-1">
            <Link
              href={badgesHref}
              aria-label={`See all badges, ${view.more} more`}
              className="grid h-11 min-w-11 place-items-center rounded-full border border-zinc-300 px-3 text-[13px] font-semibold tabular-nums dark:border-white/15"
            >
              +{view.more}
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
