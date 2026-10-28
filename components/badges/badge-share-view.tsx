import Link from "next/link";
import { Badge } from "@/components/badges/badge";
import { loginPath, signupPath } from "@/lib/auth/safe-next";
import { earnedOnLabel, type BadgeShareView as BadgeShareModel } from "@/lib/badges/share";
import { badgeSharePath } from "@/lib/share/links";
import { userHref } from "@/lib/social/user-href";

/** The public badge page: the badge big, its name, the collector, and a join button for visitors. */
export function BadgeShareView({ view, signedIn }: { view: BadgeShareModel; signedIn: boolean }) {
  const path = badgeSharePath(view.username, view.category, view.tier);
  const earned = earnedOnLabel(view.earnedAt);
  return (
    <div className="mx-auto max-w-md">
      <section
        aria-labelledby="badge-title"
        className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-[#09090B] px-6 pt-8 pb-7 text-center text-[#F4F4F5]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,_rgba(124,58,237,0.42),_transparent_62%)]"
        />
        <div className="relative flex flex-col items-center">
          <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-[#A78BFA] uppercase">
            {view.tierLabel}
          </p>
          <Badge category={view.category} tier={view.tier} size={208} label={view.name} className="mt-5" />
          <h1 id="badge-title" className="mt-5 text-[28px] leading-tight font-extrabold tracking-tight">
            {view.name}
          </h1>
          <Link
            href={userHref(view.username)}
            className="mt-1 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-[#A78BFA]"
          >
            @{view.username}
          </Link>
          {earned ? <p className="text-sm text-zinc-400">{earned}</p> : null}
        </div>
      </section>
      {signedIn ? (
        <Link
          href={`${userHref(view.username)}/badges`}
          className="mt-4 flex min-h-12 items-center justify-center rounded-full border border-zinc-300 px-5 text-[15px] font-semibold dark:border-white/15"
        >
          See all of @{view.username}&apos;s badges
        </Link>
      ) : (
        <div className="mt-4 flex flex-col items-center">
          <Link
            href={signupPath(path)}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white hover:bg-violet-500"
          >
            Join Slabhold
          </Link>
          <p className="mt-2 text-center text-sm text-zinc-500">Track your cards, earn badges, and follow collectors.</p>
          <Link
            href={loginPath(path)}
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-zinc-600 underline underline-offset-2 dark:text-zinc-300"
          >
            Log in
          </Link>
        </div>
      )}
    </div>
  );
}
