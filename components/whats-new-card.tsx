"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MentionText } from "@/components/mention-text";
import { timeAgo } from "@/lib/format";
import { RELEASE_NOTE_HANDLE, whatsNewLabel } from "@/lib/social/for-you-display";
import type { TimelineItem } from "@/lib/social/timeline";
import type { Profile } from "@/lib/social/types";

export function WhatsNewCard({
  items,
  author,
}: {
  items: TimelineItem[];
  author: Profile | null;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const handle = author?.username ?? RELEASE_NOTE_HANDLE;

  return (
    <section className="border-b border-zinc-200 dark:border-white/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="whats-new-notes"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-600/15 text-sm text-violet-700 dark:text-violet-300">
          ✦
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{whatsNewLabel(items.length)}</span>
          <span className="block truncate text-sm text-zinc-500">Updates from @{handle}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div id="whats-new-notes" className="space-y-2 px-4 pb-4">
          {items.map((item) => {
            const when = timeAgo(item.post.createdAt);
            return (
              <article
                key={item.post.id}
                className="rounded-2xl border border-zinc-200 px-3 py-2.5 dark:border-white/10"
              >
                <p className="text-[15px] leading-5 whitespace-pre-wrap">
                  <MentionText text={item.post.body} />
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  <Link
                    href={`/posts/${item.post.id}`}
                    className="inline-flex min-h-11 items-center font-semibold text-violet-700 hover:underline dark:text-violet-300"
                  >
                    Open
                  </Link>
                  {when ? ` · ${when}` : ""}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
