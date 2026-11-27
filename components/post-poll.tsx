"use client";

import type { PostPoll as Poll } from "@/lib/social/poll-meta";
import { lazyPart } from "@/lib/ui/lazy-part";

type PostPollProps = { poll: Poll; authorId: string };

/**
 * Until the live poll's chunk is in: the same rows at the same height, held
 * still, and the vote count as a skeleton. Nothing moves when it swaps in.
 */
function PostPollFrame({ poll }: PostPollProps) {
  return (
    <div role="group" aria-label="Poll" aria-busy="true" data-poll="" data-poll-state="loading" className="mt-3">
      <ul className="space-y-2">
        {poll.options.map((option) => (
          <li
            key={option.id}
            className="flex min-h-11 w-full items-center justify-center rounded-full border border-violet-600 px-3 py-2 text-15 leading-5 font-semibold text-violet-700 opacity-50 dark:border-[#A78BFA] dark:text-[#A78BFA]"
          >
            <span className="min-w-0 break-words">{option.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 min-h-5 text-14 leading-5">
        <span aria-hidden="true" className="skeleton-shimmer inline-block h-3.5 w-32 rounded-full align-middle" />
      </p>
    </div>
  );
}

/**
 * A post's poll in the feed, on the post page and on profiles. The live part
 * (counts, voting) is its own chunk (components/post-poll-live.tsx), so pages
 * without a poll never load it.
 */
export const PostPoll = lazyPart<PostPollProps>(
  () => import("@/components/post-poll-live").then((mod) => mod.PostPoll),
  PostPollFrame,
  { name: "post-poll" },
);
