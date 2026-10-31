"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Search, SquarePen } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { InboxThumb, useInboxThumb } from "@/components/message-attachments";
import { LoadMore, useLoadMore } from "@/components/load-more";
import { NewMessageSheet } from "@/components/new-message-sheet";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { EmptyState } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { loginPath } from "@/lib/auth/safe-next";
import { exactTime, timeAgo } from "@/lib/format";
import { inboxLastMessage } from "@/lib/offers/open-to-offers";
import { filterConversations, inboxConversations, type Conversation } from "@/lib/social/dm-inbox";
import type { Profile } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";

export function MessagesView() {
  const pathname = usePathname() || "/";
  const { ready, user, profiles, messages, refresh, suggestions, inboxMore, loadOlderMessages } = useSocial();
  const older = useLoadMore(loadOlderMessages);
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const closeCompose = useCallback(() => setComposing(false), []);

  useEffect(() => {
    if (ready && user) void refresh();
  }, [ready, refresh, user]);

  const conversations = useMemo(
    () => (user ? inboxConversations(messages, profiles, user.id) : []),
    [messages, profiles, user],
  );
  const shown = filterConversations(conversations, query);

  if (!ready) {
    return (
      <PullToRefresh onRefresh={refresh} className="-mx-4 -mt-5">
        <InboxSkeleton />
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
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h1 className="text-[26px] leading-8 font-extrabold tracking-tight">Messages</h1>
        <button
          type="button"
          aria-label="New message"
          onClick={() => setComposing(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-sm font-bold text-white shadow-[0_8px_22px_-8px_rgba(124,58,237,0.75)] transition-transform duration-150 active:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none"
        >
          <SquarePen className="h-4 w-4" aria-hidden="true" />
          New
        </button>
      </div>

      {conversations.length === 0 ? (
        <InboxEmpty suggestions={suggestions.slice(0, 3)} onStart={() => setComposing(true)} />
      ) : (
        <>
          <label className="mx-4 mt-3 mb-1 flex min-h-11 items-center gap-2 rounded-full bg-zinc-200/60 px-4 focus-within:ring-2 focus-within:ring-violet-600 dark:bg-white/[0.07]">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages"
              aria-label="Search messages"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
            />
          </label>
          {shown.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500">No conversations match that.</p>
          ) : (
            <ul className="mt-1">
              {shown.map((conversation) => (
                <li key={conversation.person.id}>
                  <ConversationRow conversation={conversation} viewerId={user.id} />
                </li>
              ))}
            </ul>
          )}
          {/* Older conversations: the inbox reads its newest messages a page at a time. */}
          <LoadMore
            hasMore={inboxMore.messages}
            loading={older.loading}
            failed={older.failed}
            onLoadMore={older.run}
          />
        </>
      )}
      {composing ? <NewMessageSheet onClose={closeCompose} /> : null}
    </PullToRefresh>
  );
}

function ConversationRow({ conversation, viewerId }: { conversation: Conversation; viewerId: string }) {
  const { person, last, unread } = conversation;
  const mine = last.senderId === viewerId;
  const stamp = timeAgo(last.createdAt);
  const thumb = useInboxThumb(last);
  const fresh = unread > 0;
  return (
    <Link
      href={userHref(person.username, "messages")}
      data-conversation=""
      data-unread={fresh ? "true" : "false"}
      className={`flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-zinc-900/[0.03] active:bg-zinc-900/[0.05] dark:hover:bg-white/[0.03] dark:active:bg-white/[0.05] ${
        fresh ? "bg-violet-600/[0.04] dark:bg-violet-500/[0.06]" : ""
      }`}
    >
      <Avatar
        name={person.displayName}
        image={person.avatarDataUrl}
        accent={person.accent}
        expandable={false}
        className="h-12 w-12"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            data-conversation-name=""
            className={`min-w-0 truncate text-[15px] tracking-tight ${fresh ? "font-bold" : "font-semibold"}`}
          >
            {person.displayName}
          </span>
          <span className="min-w-0 shrink truncate text-[13px] text-zinc-500">@{person.username}</span>
          {stamp ? (
            <time
              dateTime={last.createdAt}
              title={exactTime(last.createdAt)}
              className={`ml-auto shrink-0 pl-1 text-xs ${fresh ? "font-semibold text-violet-600 dark:text-[#A78BFA]" : "text-zinc-500"}`}
            >
              {stamp}
            </time>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          {thumb ? <InboxThumb thumb={thumb} /> : null}
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              fresh ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-500"
            }`}
          >
            {mine ? "You: " : ""}
            {inboxLastMessage(last)}
          </span>
          {fresh ? (
            <span data-unread-dot="" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7C3AED] shadow-[0_0_0_3px_rgba(124,58,237,0.18)]">
              <span className="sr-only">{unread} unread</span>
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function InboxSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading messages</span>
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="skeleton-shimmer h-7 w-36 rounded-lg" />
        <div className="skeleton-shimmer h-11 w-20 rounded-full" />
      </div>
      <div className="skeleton-shimmer mx-4 mt-3 h-11 rounded-full opacity-70" />
      {Array.from({ length: 5 }, (_, row) => (
        <div key={row} className="flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5">
          <div className="skeleton-shimmer h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton-shimmer h-3.5 w-32 rounded-full" />
            <div className="skeleton-shimmer h-3 w-3/4 rounded-full opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InboxEmpty({ suggestions, onStart }: { suggestions: Profile[]; onStart: () => void }) {
  return (
    <div data-inbox-empty="" className="px-6 pt-8 pb-6 text-center">
      <InboxArt />
      <p className="mt-5 text-[20px] leading-7 font-extrabold tracking-tight">No messages yet</p>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[15px] leading-5 text-zinc-500">
        Talk cards, trades and pickups with other collectors.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-6 text-[15px] font-bold text-white shadow-[0_10px_28px_-8px_rgba(124,58,237,0.75)] transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
      >
        Start a conversation
      </button>
      {suggestions.length > 0 ? (
        <div className="mx-auto mt-8 max-w-sm text-left">
          <p className="px-1 font-mono text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
            Collectors to message
          </p>
          <ul className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
            {suggestions.map((person) => (
              <li key={person.id} className="flex min-h-16 items-center gap-3 border-b border-zinc-200/70 px-3 py-2 last:border-b-0 dark:border-white/[0.07]">
                <Link href={userHref(person.username)} className="shrink-0 rounded-full" aria-label={person.displayName}>
                  <Avatar
                    name={person.displayName}
                    image={person.avatarDataUrl}
                    accent={person.accent}
                    expandable={false}
                    className="h-10 w-10"
                  />
                </Link>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5 font-bold tracking-tight">{person.displayName}</span>
                  <span className="block truncate text-[13px] leading-5 text-zinc-500">@{person.username}</span>
                </span>
                <Link
                  href={userHref(person.username, "messages")}
                  aria-label={`Message ${person.displayName}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold text-violet-700 ring-1 ring-violet-600/30 ring-inset hover:bg-violet-600/10 dark:text-[#A78BFA] dark:ring-violet-400/30"
                >
                  Message
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Two slabs and a speech bubble from brand shapes. No stock art. */
function InboxArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 140" className="mx-auto h-36 w-auto">
      <defs>
        <linearGradient id="inbox-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#5B21B6" />
        </linearGradient>
        <linearGradient id="inbox-slab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A78BFA" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7C3AED" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="inbox-glow" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#7C3AED" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="78" rx="92" ry="56" fill="url(#inbox-glow)" />
      <g className="motion-safe:animate-[inbox-float_6s_ease-in-out_infinite]" style={{ transformOrigin: "62px 74px", ["--tilt" as string]: "-9deg" }}>
        <g transform="rotate(-9 62 74)">
          <rect x="36" y="30" width="52" height="84" rx="7" fill="url(#inbox-slab)" stroke="#A78BFA" strokeOpacity="0.6" />
          <rect x="41" y="35" width="42" height="12" rx="3" fill="url(#inbox-purple)" />
          <rect x="41" y="51" width="42" height="58" rx="3" fill="#18181B" fillOpacity="0.85" />
          <path d="M62 66l3.6 7.3 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z" fill="#A78BFA" />
        </g>
      </g>
      <g className="motion-safe:animate-[inbox-float_6s_ease-in-out_-3s_infinite]" style={{ transformOrigin: "138px 80px", ["--tilt" as string]: "8deg" }}>
        <g transform="rotate(8 138 80)">
          <rect x="112" y="38" width="52" height="84" rx="7" fill="url(#inbox-slab)" stroke="#A78BFA" strokeOpacity="0.6" />
          <rect x="117" y="43" width="42" height="12" rx="3" fill="#F4F4F5" fillOpacity="0.9" />
          <rect x="117" y="59" width="42" height="58" rx="3" fill="url(#inbox-purple)" />
          <circle cx="138" cy="88" r="9" fill="none" stroke="#F4F4F5" strokeOpacity="0.7" strokeWidth="2" />
        </g>
      </g>
      <g>
        <path
          d="M78 6h44a14 14 0 0 1 14 14v14a14 14 0 0 1-14 14h-18l-11 9v-9h-15a14 14 0 0 1-14-14V20A14 14 0 0 1 78 6z"
          fill="url(#inbox-purple)"
        />
        <circle cx="86" cy="27" r="3.4" fill="#F4F4F5" />
        <circle cx="100" cy="27" r="3.4" fill="#F4F4F5" fillOpacity="0.8" />
        <circle cx="114" cy="27" r="3.4" fill="#F4F4F5" fillOpacity="0.6" />
        <circle cx="134" cy="10" r="4" fill="#34C1AE" />
      </g>
    </svg>
  );
}
