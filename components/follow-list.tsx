"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";

export function FollowList({
  kind,
  username,
}: {
  kind: "followers" | "following";
  username?: string;
}) {
  const router = useRouter();
  const { ready, user, profileByUsername, followersOf, followingOf, refresh } = useSocial();
  const profile = username ? profileByUsername(username) : user;
  const people = profile
    ? kind === "followers"
      ? followersOf(profile.id)
      : followingOf(profile.id)
    : [];
  const title = kind === "followers" ? "Followers" : "Following";
  const backHref = username ? `/u/${profile?.username ?? username}` : "/profile";

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh, username, kind]);

  if (!ready) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState title="That profile isn't available.">
        <Link href="/" className="text-sm font-bold">
          Back to Home
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="-mx-4 -mt-5">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-2 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          aria-label="Back to profile"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-6">{title}</h1>
          <p className="truncate text-xs text-zinc-500">@{profile.username}</p>
        </div>
      </div>

      {people.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={kind === "followers" ? "No followers yet" : "Not following anyone"}
          detail={
            kind === "followers"
              ? "When collectors follow this profile, they'll show up here."
              : "Accounts this profile follows will show up here."
          }
        />
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {people.map((person) => (
            <li key={person.id}>
              <Link href={`/u/${person.username}`} className="flex items-center gap-3 px-4 py-3">
                <Avatar
                  name={person.displayName}
                  image={person.avatarDataUrl}
                  accent={person.accent}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold leading-5">
                    {person.displayName}
                  </span>
                  <span className="block truncate text-sm text-zinc-500">@{person.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
