"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AtSign, Bell, Heart, MessageCircle, Quote, Repeat2, Star, UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { WantAlertOfferLink } from "@/components/open-to-offers";
import { solidButton } from "@/components/button-styles";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { loginPath } from "@/lib/auth/safe-next";
import { exactTime, timeAgo } from "@/lib/format";
import {
  groupHeadlineParts,
  groupNotifications,
  groupStaysHighlighted,
  unreadNotificationIds,
  type NotificationGroup,
} from "@/lib/social/group-notifications";
import type { NotificationKind, Profile } from "@/lib/social/types";

export function NotificationsView() {
  const pathname = usePathname() || "/";
  const { ready, user, profiles, notifications, markNotificationsRead, refresh } = useSocial();
  const userId = user?.id ?? null;
  const unreadOnVisit = useRef<{ userId: string; ids: ReadonlySet<string> } | null>(null);
  const [savedUnreadIds, setSavedUnreadIds] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await refresh();
        if (cancelled || unreadOnVisit.current?.userId === userId) return;
        const ids = new Set(unreadNotificationIds(loaded));
        unreadOnVisit.current = { userId, ids };
        setSavedUnreadIds(ids);
        markNotificationsRead([...ids]);
      } catch {
        // Leave the badge alone when the refresh fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markNotificationsRead, ready, refresh, userId]);

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
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="Nothing to see yet"
          detail="Log in to see likes, replies, mentions, and new followers."
        >
          <Link href={loginPath(pathname)} className={solidButton}>
            Log in
          </Link>
        </EmptyState>
      </div>
    );
  }

  const authors = new Map(profiles.map((profile) => [profile.id, profile]));
  const groups = groupNotifications(notifications);

  return (
    <PullToRefresh onRefresh={refresh} className="-mx-4 -mt-5">
      <h1 className="px-4 pt-5 text-2xl font-bold tracking-tight">Notifications</h1>
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No notifications yet"
          detail="Likes, replies, mentions, and new followers will show up here."
        >
          <Link href="/search" className={solidButton}>
            Find collectors
          </Link>
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-white/10">
          {groups.map((group) => {
            const href = groupHref(group, authors);
            const Icon = groupIcon(group.kind);
            const stamp = timeAgo(group.createdAt);
            const names = group.actorIds.map(
              (id) => authors.get(id)?.displayName?.trim() || "Someone",
            );
            const headline = groupHeadlineParts(group.kind, names);
            const lead = authors.get(group.actorIds[0] ?? "");
            const faces = group.actorIds.slice(0, 2);
            const highlighted = groupStaysHighlighted(group, savedUnreadIds);
            return (
              <li key={group.key} className={highlighted ? "bg-sky-500/15 dark:bg-sky-400/15" : undefined}>
                <Link
                  href={href}
                  className="relative flex w-full min-w-0 items-start gap-3 px-4 py-3"
                >
                  {highlighted ? (
                    <span
                      className="absolute top-7 left-1.5 h-2 w-2 rounded-full bg-sky-500 dark:bg-sky-400"
                      aria-hidden="true"
                    />
                  ) : null}
                  {faces.length > 1 ? (
                    <span className="flex shrink-0 -space-x-3">
                      {faces.map((id) => {
                        const person = authors.get(id);
                        return (
                          <Avatar
                            key={id}
                            name={person?.displayName ?? "Collector"}
                            image={person?.avatarDataUrl}
                            accent={person?.accent}
                            className="h-8 w-8 text-[10px] ring-2 ring-[var(--background)]"
                          />
                        );
                      })}
                    </span>
                  ) : (
                    <Avatar
                      name={lead?.displayName ?? "Collector"}
                      image={lead?.avatarDataUrl}
                      accent={lead?.accent}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    {highlighted ? <span className="sr-only">Unread. </span> : null}
                    <span className="block text-[15px] leading-5">
                      {group.kind === "want_alert" ? (
                        <span>{group.preview}</span>
                      ) : (
                        <>
                          <span className="font-bold">{headline.lead}</span>
                          {headline.rest}
                        </>
                      )}
                      {stamp ? (
                        <time
                          dateTime={group.createdAt}
                          title={exactTime(group.createdAt)}
                          className="whitespace-nowrap text-zinc-500"
                        >
                          {" "}· {stamp}
                        </time>
                      ) : null}
                    </span>
                    {group.preview && group.kind !== "want_alert" ? (
                      <span className="mt-0.5 block truncate text-sm text-zinc-500">{group.preview}</span>
                    ) : null}
                  </span>
                  <Icon className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
                {group.kind === "want_alert" ? (
                  <WantAlertOfferLink metadata={group.notes[0]?.metadata} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </PullToRefresh>
  );
}

function groupHref(group: NotificationGroup, authors: Map<string, Profile>) {
  const note = group.notes[0];
  const actor = group.actorIds[0] ? authors.get(group.actorIds[0]) : undefined;
  if (!note) return "/";
  if (note.kind === "want_alert") {
    return note.href || (note.postId ? `/posts/${note.postId}` : "/collection");
  }
  if (note.kind === "follow") return actor ? `/u/${actor.username}` : "/profile";
  return note.postId ? `/posts/${note.postId}` : "/";
}

function groupIcon(kind: NotificationKind) {
  if (kind === "like") return Heart;
  if (kind === "comment") return MessageCircle;
  if (kind === "repost") return Repeat2;
  if (kind === "quote") return Quote;
  if (kind === "mention") return AtSign;
  if (kind === "want_alert") return Star;
  return UserPlus;
}
