"use client";

import { useEffect, useRef, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { followCountWithViewer } from "./profile-cache";

type Read = { userId: string; followers: number; following: number; followedAtRead: boolean };

/**
 * Follower and following counts for a profile header. The viewer's own come
 * from their follow edges in memory. Anyone else's are two head counts, read
 * once per person and moved by the viewer's own follow taps since then.
 * Null while the read is on the way.
 */
export function useFollowCounts(userId: string | null): { followers: number | null; following: number | null } {
  const { user, mode, followerCount, followingCount, isFollowing } = useSocial();
  const own = mode !== "supabase" || !userId || userId === user?.id;
  const followsNow = userId && !own ? isFollowing(userId) : false;
  const followsRef = useRef(followsNow);
  useEffect(() => {
    followsRef.current = followsNow;
  }, [followsNow]);
  const [read, setRead] = useState<Read | null>(null);
  useEffect(() => {
    if (own || !userId) return;
    let cancelled = false;
    const followedAtRead = followsRef.current;
    void (async () => {
      const [client, { loadFollowCounts }] = await Promise.all([
        loadSupabaseBrowser(),
        import("./profile-cache"),
      ]);
      if (!client || cancelled) return;
      const counts = await loadFollowCounts(client, userId);
      if (!cancelled) setRead({ userId, ...counts, followedAtRead });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [own, userId]);
  if (own) {
    return userId ? { followers: followerCount(userId), following: followingCount(userId) } : { followers: null, following: null };
  }
  if (!read || read.userId !== userId) return { followers: null, following: null };
  return {
    followers: followCountWithViewer(read.followers, { followedAtRead: read.followedAtRead, followsNow }),
    following: read.following,
  };
}
