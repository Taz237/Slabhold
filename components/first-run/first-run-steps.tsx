"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { useSocial } from "@/components/social-provider";
import type { Profile } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";

export type FirstRunPerson = Profile & { suggestionReason?: string | null };

/**
 * Get started's follow step, inline: three real collectors from the
 * suggestions Home already loaded, and Follow all. Loaded with lazyPart; the
 * skeleton in get-started.tsx has the same 44px header and 56px rows.
 */
export function FirstRunPeople({ people, current }: { people: FirstRunPerson[]; current: boolean }) {
  const { followMany, isFollowing, user } = useSocial();
  const pending = people.filter((person) => user && person.id !== user.id && !isFollowing(person.id));
  return (
    <div className="pb-2 pl-11">
      <div className="flex h-11 items-center justify-between gap-2">
        <p className="text-[13px] leading-5 text-zinc-500">Suggested for you</p>
        <button
          type="button"
          disabled={pending.length === 0}
          onClick={() => void followMany(pending.map((person) => person.id))}
          className={`-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-medium tabular-nums transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none disabled:text-zinc-500 motion-reduce:transition-none ${
            current
              ? "text-[#7C3AED] hover:bg-[#7C3AED]/[0.08] dark:text-[#A78BFA] dark:hover:bg-[#7C3AED]/10"
              : "text-zinc-900 hover:bg-zinc-950/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          }`}
        >
          {pending.length === 0 ? "Following all" : `Follow all ${pending.length}`}
        </button>
      </div>
      <ul aria-label="Collectors to follow">
        {people.map((person) => (
          <li key={person.id} className="flex h-14 items-center gap-3">
            <Link
              href={userHref(person.username)}
              aria-label={person.displayName}
              className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
            >
              <Avatar
                name={person.displayName}
                image={person.avatarDataUrl}
                accent={person.accent}
                expandable={false}
                className="h-9 w-9 text-xs"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={userHref(person.username)}
                className="block truncate text-[15px] leading-5 font-medium hover:underline"
              >
                {person.displayName}
              </Link>
              <p className="truncate text-[13px] leading-5 text-zinc-500">
                @{person.username}
                {person.suggestionReason ? ` · ${person.suggestionReason}` : ""}
              </p>
            </div>
            <FollowButton userId={person.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
