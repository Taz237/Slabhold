"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { trackEvent } from "@/lib/analytics";
import { initials } from "@/lib/format";
import type { FounderShowcase } from "@/lib/landing/founder";
import { userHref } from "@/lib/social/user-href";

const BOX =
  "flex min-h-[92px] items-center gap-3.5 rounded-[1.25rem] border border-white/10 bg-white/[0.035] px-4 py-3.5";

/**
 * A small "from the founder" line below the panels. Null profile is the plain
 * note with the logo, same height, so nothing jumps when the fetch fails.
 */
export function FounderNote({ showcase }: { showcase: FounderShowcase | null }) {
  if (!showcase) {
    return (
      <div aria-hidden className={BOX} data-founder-note="loading">
        <span className="skeleton-shimmer h-12 w-12 shrink-0 rounded-full" />
        <span className="flex-1 space-y-2">
          <span className="skeleton-shimmer block h-3 w-24 rounded" />
          <span className="skeleton-shimmer block h-4 w-40 rounded" />
        </span>
      </div>
    );
  }

  const profile = showcase.profile;
  if (!profile) {
    return (
      <div className={BOX} data-founder-note="plain">
        <Logo className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">Slabhold</p>
          <p className="mt-0.5 text-[15px] leading-5 font-semibold text-zinc-100">Built by collectors, for collectors.</p>
        </div>
      </div>
    );
  }

  const href = userHref(profile.username);
  return (
    <section aria-label="From the founder" className={BOX} data-founder-note="founder">
      {profile.avatarUrl ? (
        // Unoptimized: avatars are outside the card-photos optimizer pattern.
        <Image
          src={profile.avatarUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[#7C3AED]/60"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#7C3AED] to-[#5B21B6] text-sm font-semibold text-white"
        >
          {initials(profile.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">From the founder</p>
        <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[15px] font-bold tracking-tight text-white">{profile.displayName}</span>
          <span className="truncate text-[13px] text-zinc-400">@{profile.username}</span>
        </p>
        <Link
          href={href}
          onClick={() => trackEvent("landing_cta_clicked", { button: "founder_follow" })}
          className="-my-2.5 inline-flex min-h-11 items-center gap-1 rounded-full text-[14px] font-semibold text-[#A78BFA] hover:text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
        >
          Follow on Slabhold
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
