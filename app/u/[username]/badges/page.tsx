import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/badges/badge";
import { BADGE_CATEGORIES, CATEGORY_COPY, TIER_LABELS, tierRank } from "@/lib/badges/config";
import { loadProfileBadges } from "@/lib/badges/load";
import { userHref } from "@/lib/social/user-href";
import { getAuthUserId } from "@/lib/supabase/server";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} badges` };
}

/** Earned badges only, read-only. Hidden when show_badges is off or there are none. */
export default async function ProfileBadgesPage({ params }: Props) {
  const { username } = await params;
  const name = decodeURIComponent(username);
  const badges = await loadProfileBadges({ username: name }, await getAuthUserId());
  if (!badges || badges.view.kind !== "strip") notFound();
  const earned = [...badges.earned].sort(
    (a, b) =>
      BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category) ||
      tierRank(b.tier) - tierRank(a.tier),
  );
  const categories = BADGE_CATEGORIES.filter((category) => earned.some((badge) => badge.category === category));
  return (
    <div>
      <Link
        href={userHref(badges.username)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1 text-sm font-medium text-zinc-500"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />@{badges.username}
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Badges</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {earned.length} earned by @{badges.username}
      </p>
      <div className="mt-5 space-y-4">
        {categories.map((category) => (
          <section
            key={category}
            aria-labelledby={`badges-${category}`}
            className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <h2 id={`badges-${category}`} className="text-[15px] font-semibold">
              {CATEGORY_COPY[category].label}
            </h2>
            <ul className="mt-3 grid grid-cols-3 gap-y-4 min-[420px]:grid-cols-4">
              {earned
                .filter((badge) => badge.category === category)
                .map((badge) => (
                  <li key={badge.tier} className="flex flex-col items-center text-center">
                    <Badge category={badge.category} tier={badge.tier} size={64} label="" />
                    <span
                      className={`mt-1 text-xs font-medium ${
                        badge.tier === "legendary" ? "text-violet-700 dark:text-[#A78BFA]" : "text-zinc-500"
                      }`}
                    >
                      {TIER_LABELS[badge.tier]}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
