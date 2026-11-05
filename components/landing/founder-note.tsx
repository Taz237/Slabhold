import { getImageProps } from "next/image";
import { LandingLink } from "@/components/landing/landing-links";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { Logo } from "@/components/logo";
import { initials } from "@/lib/format";
import { avatarThumbSrc } from "@/lib/images/avatar-thumb";
import type { FounderShowcase } from "@/lib/landing/founder";
import { userHref } from "@/lib/social/user-href";

const BOX =
  "flex min-h-[92px] items-center gap-3.5 rounded-[1.25rem] border border-white/10 bg-[#121214] px-4 py-3.5";

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
        <NoHeadPreload>
          <Logo className="h-12 w-12 shrink-0" />
        </NoHeadPreload>
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-400">Slabhold</p>
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
        // Supabase cuts our own avatars to 96px (2x the drawn 48px), so the
        // note doesn't fetch the full upload.
        // next/image's props on a plain <img>, so the server draws it with no client code.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...getImageProps({
            src: avatarThumbSrc(profile.avatarUrl, 96),
            alt: "",
            width: 48,
            height: 48,
            unoptimized: true,
            loading: "lazy",
          }).props}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[#7C3AED]/60"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-sm font-semibold text-white"
        >
          {initials(profile.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-zinc-400">From the founder</p>
        <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[15px] font-semibold tracking-tight text-white">{profile.displayName}</span>
          <span className="truncate text-[13px] text-zinc-400">@{profile.username}</span>
        </p>
        <LandingLink
          href={href}
          button="founder_follow"
          className="-my-2.5 inline-flex min-h-11 items-center gap-1 rounded-full text-[14px] font-semibold text-[#A78BFA] hover:text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
        >
          Follow on Slabhold
          <ArrowRightIcon />
        </LandingLink>
      </div>
    </section>
  );
}

/**
 * lucide's arrow-right, drawn inline. lucide-react's Icon is a client
 * component, so importing it here would ship it in the landing page's
 * first-load JS just for this arrow.
 */
function ArrowRightIcon() {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
