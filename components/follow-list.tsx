"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LoadMore, useLoadMore } from "@/components/load-more";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import type { FollowCursor } from "@/lib/social/profile-cache";
import type { Profile } from "@/lib/social/types";
import { useProfiles } from "@/lib/social/use-profiles";
import { ReadRetry } from "@/components/read-retry";
import { userHref } from "@/lib/social/user-href";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

type Paged = { key: string; people: Profile[]; next: FollowCursor | null };

/**
 * Someone else's followers or follows, a page at a time from their own read.
 * Null `userId` reads nothing (the viewer's own lists come from memory).
 */
async function readFollowPage(userId: string, kind: "followers" | "following", cursor: FollowCursor | null) {
  const [client, { loadFollowPage }] = await Promise.all([
    loadSupabaseBrowser(),
    import("@/lib/social/profile-cache"),
  ]);
  if (!client) return { profiles: [] as Profile[], next: null };
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  const viewer = user ? { id: user.id, email: user.email ?? "" } : null;
  return loadFollowPage(client, { userId, kind, cursor, viewer });
}

function useFollowPage(userId: string | null, kind: "followers" | "following") {
  const key = userId ? `${userId}:${kind}` : "";
  const [paged, setPaged] = useState<Paged | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const pageKey = `${userId}:${kind}`;
    readFollowPage(userId, kind, null).then(
      (page) => {
        if (!cancelled) setPaged({ key: pageKey, people: page.profiles, next: page.next });
      },
      () => {
        if (!cancelled) setFailedKey(pageKey);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, userId]);
  const current = paged?.key === key ? paged : null;
  const loadMore = useCallback(async () => {
    if (!userId || !current?.next) return;
    const page = await readFollowPage(userId, kind, current.next);
    setPaged((latest) =>
      latest?.key === current.key
        ? { key: latest.key, people: [...latest.people, ...page.profiles], next: page.next }
        : latest,
    );
  }, [current, kind, userId]);
  return {
    people: current?.people ?? [],
    hasMore: Boolean(current?.next),
    ready: !key || Boolean(current) || failedKey === key,
    loadMore,
  };
}

export function FollowList({
  kind,
  username,
}: {
  kind: "followers" | "following";
  username?: string;
}) {
  const router = useRouter();
  const { ready, mode, user, profileByUsername, followersOf, followingOf, refresh } = useSocial();
  const profile = username ? profileByUsername(username) : user;
  const profileRead = useProfiles(username && !profile ? { usernames: [username] } : null);
  // The viewer's own lists are complete in memory and follow their taps at once.
  const own = mode !== "supabase" || Boolean(profile && user && profile.id === user.id);
  const paged = useFollowPage(!own && profile ? profile.id : null, kind);
  const more = useLoadMore(paged.loadMore);
  const people = profile
    ? own
      ? kind === "followers"
        ? followersOf(profile.id)
        : followingOf(profile.id)
      : paged.people
    : [];
  const title = kind === "followers" ? "Followers" : "Following";
  const backHref = username ? userHref(profile?.username ?? username) : "/profile";

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh, username, kind]);

  if (!profile && profileRead.failed) {
    return <ReadRetry title="Couldn't load this profile" onRetry={profileRead.retry} />;
  }

  if (!ready || (!profile && !profileRead.ready) || !paged.ready) {
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
          data-nav-href={backHref}
          data-nav-back=""
          aria-label="Back to profile"
          className="hit-44 grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
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
              <Link href={userHref(person.username)} className="flex items-center gap-3 px-4 py-3">
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
      <LoadMore hasMore={paged.hasMore} loading={more.loading} failed={more.failed} onLoadMore={more.run} />
    </div>
  );
}
