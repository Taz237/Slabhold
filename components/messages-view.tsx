"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoadMore } from "@/components/load-more";
import { Mail } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { loginPath } from "@/lib/auth/safe-next";
import { exactTime, timeAgo } from "@/lib/format";
import { inboxLastMessage } from "@/lib/offers/open-to-offers";
import { userHref } from "@/lib/social/user-href";
import type { DirectMessage, Profile } from "@/lib/social/types";

type Conversation = {
  person: Profile;
  last: DirectMessage;
  unread: number;
};

export function MessagesView() {
  const pathname = usePathname() || "/";
  const { ready, user, profiles, messages, refresh, messagesHasMore, loadMoreMessages } = useSocial();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (ready && user) void refresh();
  }, [ready, refresh, user]);

  const conversations = useMemo(() => {
    if (!user) return [];
    const people = new Map(profiles.map((profile) => [profile.id, profile]));
    const grouped = new Map<string, Conversation>();
    for (const message of messages) {
      const partnerId = message.senderId === user.id ? message.receiverId : message.senderId;
      const person = people.get(partnerId);
      if (!person) continue;
      const current = grouped.get(partnerId);
      const unread =
        (current?.unread ?? 0) + (message.receiverId === user.id && !message.read ? 1 : 0);
      if (!current || message.createdAt > current.last.createdAt) {
        grouped.set(partnerId, { person, last: message, unread });
      } else {
        grouped.set(partnerId, { ...current, unread });
      }
    }
    return [...grouped.values()].sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [messages, profiles, user]);

  if (!ready) {
    return (
      <PullToRefresh onRefresh={refresh} className="-mx-4 -mt-5">
        <LoadingRows />
      </PullToRefresh>
    );
  }

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="Your messages"
          detail="Log in to send private messages."
        >
          <Link href={loginPath(pathname)} className={solidButton}>
            Log in
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} className="-mx-4 -mt-5">
      <h1 className="px-4 pt-5 text-2xl font-bold tracking-tight">Messages</h1>
      {conversations.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No messages yet"
          detail="Message a collector from their profile."
        >
          <Link href="/search" className={solidButton}>
            Find collectors
          </Link>
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-white/10">
          {conversations.map(({ person, last, unread }) => {
            const mine = last.senderId === user.id;
            const stamp = timeAgo(last.createdAt);
            return (
              <li key={person.id}>
                <Link href={userHref(person.username, "messages")} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={person.displayName} image={person.avatarDataUrl} accent={person.accent} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] ${unread > 0 ? "font-bold" : "font-medium"}`}>
                        {person.displayName}
                      </span>
                      {stamp ? (
                        <time
                          dateTime={last.createdAt}
                          title={exactTime(last.createdAt)}
                          className="shrink-0 text-xs text-zinc-500"
                        >
                          {stamp}
                        </time>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          unread > 0 ? "font-medium text-zinc-800 dark:text-zinc-100" : "text-zinc-500"
                        }`}
                      >
                        {mine ? "You: " : ""}
                        {inboxLastMessage(last)}
                      </span>
                      {unread > 0 ? (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {user ? (
        <LoadMore
          hasMore={messagesHasMore}
          loading={loadingMore}
          onLoadMore={() => {
            setLoadingMore(true);
            void loadMoreMessages().finally(() => setLoadingMore(false));
          }}
        />
      ) : null}
    </PullToRefresh>
  );
}
