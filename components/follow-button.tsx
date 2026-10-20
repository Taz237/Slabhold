"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { signupPath } from "@/lib/auth/safe-next";

const followButton =
  "inline-flex min-w-[6.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-opacity active:opacity-70";

export function FollowButton({ userId }: { userId: string }) {
  const pathname = usePathname() || "/";
  const { user, isFollowing, toggleFollow, blockedIds } = useSocial();
  const followed = isFollowing(userId);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setOptimistic(null);
  }, [followed]);

  if (user?.id === userId || blockedIds.includes(userId)) return null;

  if (!user) {
    return (
      <Link href={signupPath(pathname)} className={`${followButton} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950`}>
        Follow
      </Link>
    );
  }

  const following = optimistic ?? followed;

  return (
    <button
      type="button"
      aria-pressed={following}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (busy.current) return;
        if (!following) trackEvent("follow_clicked");
        busy.current = true;
        setOptimistic(!following);
        void toggleFollow(userId).finally(() => {
          busy.current = false;
          setOptimistic(null);
        });
      }}
      className={
        following
          ? `${followButton} border border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100`
          : `${followButton} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950`
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
