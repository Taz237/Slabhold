"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { FollowButton } from "@/components/follow-button";
import { useSocial } from "@/components/social-provider";
import { SnapRail } from "@/components/timeline-ui";
import type { Profile } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";

type Suggestion = Profile & { suggestionReason?: string | null };

/** Who to follow: a snap rail of collector cards, with Follow all. */
export function CollectorSuggestions({
  profiles,
  title = "Collectors to follow",
  bordered = true,
}: {
  profiles: Suggestion[];
  title?: string;
  bordered?: boolean;
}) {
  const { followMany, isFollowing, user } = useSocial();
  const pending = profiles.filter((profile) => user && profile.id !== user.id && !isFollowing(profile.id));
  return (
    <section
      id="collectors-to-follow"
      aria-label={title}
      className={`scroll-mt-28 py-4 ${bordered ? "border-b border-zinc-200/70 dark:border-white/[0.07]" : ""}`}
    >
      <div className="mb-3 flex min-h-11 items-center justify-between gap-2 px-4 max-md:pr-20">
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {pending.length > 0 ? (
          <button
            type="button"
            onClick={() => void followMany(pending.map((profile) => profile.id))}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-violet-600 hover:bg-violet-600/10 dark:text-[#A78BFA] dark:hover:bg-violet-500/10"
          >
            Follow all
          </button>
        ) : null}
      </div>
      <SnapRail label={title}>
        {profiles.map((profile) => (
          <div
            key={profile.id}
            role="listitem"
            className="relative flex w-[42%] max-w-48 min-w-36 shrink-0 snap-start flex-col items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white px-3 pb-3 text-center dark:border-white/10 dark:bg-white/[0.03]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-11 opacity-30 dark:opacity-40"
              style={{ background: `linear-gradient(135deg, ${profile.accent}, transparent)` }}
            />
            <Link
              href={userHref(profile.username)}
              aria-label={profile.displayName}
              className="relative mt-4 rounded-full ring-4 ring-white dark:ring-[#09090B]"
            >
              <Avatar
                name={profile.displayName}
                image={profile.avatarDataUrl}
                accent={profile.accent}
                expandable={false}
                className="h-14 w-14 text-base"
              />
            </Link>
            <Link
              href={userHref(profile.username)}
              className="mt-2 block w-full truncate text-sm font-bold tracking-tight hover:underline"
            >
              {profile.displayName}
            </Link>
            <p className="w-full truncate text-xs text-zinc-500">@{profile.username}</p>
            <p className="mt-1 line-clamp-1 min-h-4 w-full text-[11px] text-zinc-500">
              {profile.suggestionReason ?? ""}
            </p>
            <div className="mt-3">
              <FollowButton userId={profile.id} />
            </div>
          </div>
        ))}
      </SnapRail>
    </section>
  );
}

/** Following tab with nobody followed yet: a friendly line and collectors right there. */
export function FollowingEmpty({ profiles }: { profiles: Suggestion[] }) {
  return (
    <div className="pt-8">
      <div className="px-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-violet-600/10 text-violet-600 dark:bg-violet-500/15 dark:text-[#A78BFA]">
          <Compass className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-[17px] font-bold tracking-tight">Your Following feed is quiet</p>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-sm leading-5 text-zinc-500">
          Follow a few collectors and their posts, pickups and cards land here.
        </p>
        {profiles.length === 0 ? (
          <div className="mt-4">
            <Link href="/search" className={solidButton}>
              Find collectors
            </Link>
          </div>
        ) : null}
      </div>
      {profiles.length > 0 ? (
        <div className="mt-4">
          <CollectorSuggestions profiles={profiles} title="Start with these" bordered={false} />
        </div>
      ) : null}
    </div>
  );
}
