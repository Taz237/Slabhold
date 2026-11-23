"use client";

import { useContext, useEffect, useSyncExternalStore } from "react";
import { UserPlus, X } from "lucide-react";
import { useInviteShare } from "@/components/invite/invite-button";
import { SocialContext } from "@/components/social-provider";
import {
  INVITE_MOMENT_COPY,
  dismissInviteMoment,
  markInviteMomentShown,
  shouldShowInviteMoment,
  type InviteMoment,
  type MomentStore,
} from "@/lib/invites/moments";

function momentStore(): MomentStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The signed-in collector, or null. Outside the app's provider (a bare render) there's nobody to invite from. */
function useViewer() {
  return useContext(SocialContext)?.user ?? null;
}

const listeners = new Set<() => void>();
// A dismiss in storage that's blocked still hides the row for this page load.
const hiddenThisLoad = new Set<string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether this invite moment is up for the signed-in collector: at most once
 * a week each, and gone on dismiss. Never drawn on the server, so the first
 * paint never flashes a row that storage then hides.
 */
export function useInviteMoment(moment: InviteMoment, userId: string | null) {
  const key = `${moment}:${userId ?? ""}`;
  const visible = useSyncExternalStore(
    subscribe,
    () => Boolean(userId) && !hiddenThisLoad.has(key) && shouldShowInviteMoment(momentStore(), moment, userId ?? ""),
    () => false,
  );

  useEffect(() => {
    if (visible && userId) markInviteMomentShown(momentStore(), moment, userId);
  }, [visible, moment, userId]);

  function dismiss() {
    if (!userId) return;
    hiddenThisLoad.add(key);
    dismissInviteMoment(momentStore(), moment, userId);
    listeners.forEach((listener) => listener());
  }

  return { visible, dismiss };
}

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/**
 * Top of Home, while you follow fewer than 5 collectors. Tapping it shares
 * your invite link like the profile's Invite button.
 */
export function HomeInviteRow() {
  const user = useViewer();
  const { visible, dismiss } = useInviteMoment("home", user?.id ?? null);
  if (!user || !visible) return null;
  return <HomeInviteRowView username={user.username} onDismiss={dismiss} />;
}

function HomeInviteRowView({ username, onDismiss }: { username: string; onDismiss: () => void }) {
  const { share, sheet } = useInviteShare(username);
  return (
    <section
      data-invite-moment="home"
      aria-label="Invite a collector"
      className="border-b border-zinc-200 px-4 py-2 motion-safe:animate-[add-fade_200ms_ease-out_both] dark:border-white/10"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void share()}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pr-2 text-left ${focusRing}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-700 dark:text-[#A78BFA]">
            <UserPlus aria-hidden className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm leading-5 text-zinc-700 dark:text-zinc-300">
            {INVITE_MOMENT_COPY.home}
          </span>
          <span
            aria-hidden
            className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-13 font-semibold text-white"
          >
            Invite
          </span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss invite"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focusRing}`}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {sheet}
    </section>
  );
}

/**
 * The Added scene, right after a save: a quiet second action that sends your
 * invite link (it opens on your collection).
 */
export function AddedInviteAction({ userId, username }: { userId: string; username: string }) {
  const signedIn = useViewer() !== null;
  const { visible, dismiss } = useInviteMoment("added", userId);
  if (!signedIn || !visible) return null;
  return <AddedInviteActionView username={username} onDismiss={dismiss} />;
}

function AddedInviteActionView({ username, onDismiss }: { username: string; onDismiss: () => void }) {
  const { share, sheet } = useInviteShare(username);
  return (
    <div data-invite-moment="added" className="mt-2 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => void share()}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-violet-700 hover:text-violet-600 dark:text-[#A78BFA] dark:hover:text-[#C4B5FD] ${focusRing}`}
      >
        <UserPlus aria-hidden className="h-4 w-4" />
        {INVITE_MOMENT_COPY.added}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss Show a buddy"
        className={`grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focusRing}`}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
      {sheet}
    </div>
  );
}

/** Under your own spot on this week's board. The board is always dark. */
export function LeaderboardInviteRow() {
  const user = useViewer();
  const { visible, dismiss } = useInviteMoment("leaderboard", user?.id ?? null);
  if (!user || !visible) return null;
  return <LeaderboardInviteRowView username={user.username} onDismiss={dismiss} />;
}

function LeaderboardInviteRowView({ username, onDismiss }: { username: string; onDismiss: () => void }) {
  const { share, sheet } = useInviteShare(username);
  return (
    <div
      data-invite-moment="leaderboard"
      className="mt-2 flex items-center gap-1 rounded-2xl bg-black/25 py-1 pr-1 pl-1 ring-1 ring-white/10 motion-safe:animate-[add-fade_200ms_ease-out_both]"
    >
      <button
        type="button"
        onClick={() => void share()}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-white/30 text-[#C4B5FD]">
          <UserPlus aria-hidden className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-white">
          {INVITE_MOMENT_COPY.leaderboard}
        </span>
        <span aria-hidden className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-13 font-semibold text-white">
          Invite
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss invite"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-400 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
      {sheet}
    </div>
  );
}
