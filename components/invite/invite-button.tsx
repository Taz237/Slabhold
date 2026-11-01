"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { UserPlus } from "lucide-react";
import { useShareSheet, type ShareTarget } from "@/components/share-sheet";
import { useSocial } from "@/components/social-provider";
import { fetchInviteCode } from "@/lib/invites/code";
import { INVITE_SHARE_TEXT, invitePath } from "@/lib/share/links";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

export function inviteTarget(username: string, code: string | null = null): ShareTarget {
  return {
    path: invitePath(username, code),
    title: "Invite a collector",
    text: INVITE_SHARE_TEXT,
    source: "invite",
  };
}

// One read per signed-in user per page load. A miss is forgotten so the next mount retries.
const codes = new Map<string, Promise<string | null>>();
// Bumped when a code is replaced, so every mounted entry point reads the new one.
const listeners = new Set<() => void>();
let version = 0;

function loadInviteCode(userId: string): Promise<string | null> {
  let pending = codes.get(userId);
  if (!pending) {
    pending = loadSupabaseBrowser().then(fetchInviteCode).then((code) => {
      if (!code) codes.delete(userId);
      return code;
    });
    codes.set(userId, pending);
  }
  return pending;
}

/** After a reset: every invite entry point on the page shares the new code. */
export function replaceInviteCode(userId: string, code: string) {
  codes.set(userId, Promise.resolve(code));
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Your invite code, read as soon as an invite entry point mounts so the link is
 * ready by the time you tap. Null in local mode, before the migration, or
 * while it loads; the link then has no code and gets no follow-back.
 */
export function useInviteCode(): { code: string | null; loading: boolean } {
  const { mode, user } = useSocial();
  const userId = mode === "supabase" ? (user?.id ?? null) : null;
  const current = useSyncExternalStore(subscribe, () => version, () => 0);
  const [loaded, setLoaded] = useState<{ userId: string; version: number; code: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadInviteCode(userId).then((code) => {
      if (!cancelled) setLoaded({ userId, version: current, code });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, current]);

  const ready = loaded && loaded.userId === userId ? loaded : null;
  return {
    // A replaced code shows at once; the old one is never shared after a reset.
    code: ready && ready.version === current ? ready.code : null,
    loading: Boolean(userId) && !(ready && ready.version === current),
  };
}

/**
 * Your invite link (/i/<username>?c=<code>) through the native share sheet on
 * a phone. On a computer, or when sharing fails, our sheet: Post on X and Copy link.
 */
export function useInviteShare(username: string) {
  const { code } = useInviteCode();
  return useShareSheet(inviteTarget(username, code));
}

/** On your own profile, next to Edit profile. */
export function InviteButton({ username, className }: { username: string; className: string }) {
  const { share, sheet } = useInviteShare(username);
  return (
    <>
      <button type="button" data-invite-button="" onClick={() => void share()} className={className}>
        <UserPlus aria-hidden className="mr-1.5 h-4 w-4" />
        Invite
      </button>
      {sheet}
    </>
  );
}
