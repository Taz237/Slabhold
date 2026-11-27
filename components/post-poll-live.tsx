"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PostPollView } from "@/components/post-poll-view";
import { useSocial } from "@/components/social-provider";
import { usePollCounts, usePollStore } from "@/components/use-poll-store";
import { signupPath } from "@/lib/auth/safe-next";
import { haptic } from "@/lib/ios/haptics";
import { pollNextTick, type PostPoll as Poll } from "@/lib/social/polls";

/** The clock a poll reads, waking when its "time left" words would change. */
function usePollClock(endsAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const wait = pollNextTick(endsAt, now);
    if (wait == null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [endsAt, now]);
  return now;
}

/** A post's poll in the feed, on the post page and on profiles: counts load in batches, votes save at once. */
export function PostPoll({ poll, authorId }: { poll: Poll; authorId: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { user } = useSocial();
  const { store, ready } = usePollStore();
  const counts = usePollCounts(store, poll.id);
  const now = usePollClock(poll.endsAt);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    if (ready) store.request(poll.id);
  }, [poll.id, ready, store]);

  async function vote(optionId: string) {
    setError(null);
    const result = await store.vote(poll, optionId, { signedIn: Boolean(user), isAuthor: user?.id === authorId });
    if (result.error && result.refusal !== "busy") setError(result.error);
    if (!result.error) {
      haptic("select");
      setVoted(true);
    }
  }

  return (
    <PostPollView
      poll={poll}
      authorId={authorId}
      viewerId={user?.id ?? null}
      counts={counts}
      now={now}
      error={error}
      voted={voted}
      onVote={(optionId) => void vote(optionId)}
      onSignIn={() => router.push(signupPath(pathname))}
    />
  );
}
