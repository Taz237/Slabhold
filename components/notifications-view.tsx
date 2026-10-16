"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AtSign, Bell, Heart, MessageCircle, Quote, Repeat2, UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { exactTime, timeAgo } from "@/lib/format";
import type { Notification } from "@/lib/social/types";

function actionText(kind: Notification["kind"]) {
  if (kind === "like") return "liked your post";
  if (kind === "comment") return "commented on your post";
  if (kind === "repost") return "reposted your post";
  if (kind === "quote") return "quoted your post";
  if (kind === "mention") return "mentioned you";
  return "followed you";
}

export function NotificationsView() {
  const { ready, user, profiles, notifications, unreadCount, markNotificationsRead, refresh } = useSocial();

  useEffect(() => {
    if (ready && user) void refresh();
  }, [ready, refresh, user]);

  useEffect(() => {
    if (ready && user && unreadCount > 0) markNotificationsRead();
  }, [markNotificationsRead, ready, unreadCount, user]);

  if (!ready) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows />
      </div>
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
          <Link href="/login" className={solidButton}>
            Log in
          </Link>
        </EmptyState>
      </div>
    );
  }

  const authors = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <div className="-mx-4 -mt-5">
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
          {notifications.map((note) => {
            const actor = authors.get(note.actorId);
            const href =
              note.kind === "follow"
                ? actor
                  ? `/u/${actor.username}`
                  : "/profile"
                : note.postId
                  ? `/posts/${note.postId}`
                  : "/";
            const Icon =
              note.kind === "like"
                ? Heart
                : note.kind === "comment"
                  ? MessageCircle
                  : note.kind === "repost"
                    ? Repeat2
                    : note.kind === "quote"
                      ? Quote
                      : note.kind === "mention"
                        ? AtSign
                        : UserPlus;
            const stamp = timeAgo(note.createdAt);
            return (
              <li key={note.id}>
                <Link href={href} className="flex gap-3 px-4 py-3">
                  <Avatar
                    name={actor?.displayName ?? "Collector"}
                    image={actor?.avatarDataUrl}
                    accent={actor?.accent}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-5">
                      <span className="font-bold">{actor?.displayName ?? "Someone"}</span>{" "}
                      {actionText(note.kind)}
                      {stamp ? (
                        <time
                          dateTime={note.createdAt}
                          title={exactTime(note.createdAt)}
                          className="whitespace-nowrap text-zinc-500"
                        >
                          {" "}· {stamp}
                        </time>
                      ) : null}
                    </span>
                    {note.preview ? (
                      <span className="mt-0.5 block truncate text-sm text-zinc-500">{note.preview}</span>
                    ) : null}
                  </span>
                  <Icon className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
