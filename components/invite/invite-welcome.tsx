"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { useSocial } from "@/components/social-provider";
import { acceptInvite, inviteOutcome, type InviteOutcome } from "@/lib/invites/accept";
import { clearInvite, inviteStore, readInvite } from "@/lib/invites/attribution";
import type { Profile } from "@/lib/social/types";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

export type Inviter = { id: string; username: string; displayName: string; avatarUrl: string | null };

async function findInviter(username: string, local: Profile[]): Promise<Inviter | null> {
  const known = local.find((profile) => profile.username.toLowerCase() === username);
  if (known) {
    return { id: known.id, username: known.username, displayName: known.displayName, avatarUrl: known.avatarDataUrl };
  }
  const supabase = await loadSupabaseBrowser();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", username)
    .maybeSingle<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>();
  if (!data) return null;
  return { id: data.id, username: data.username, displayName: data.display_name || data.username, avatarUrl: data.avatar_url };
}

/**
 * First-run setup, after signing up through someone's /i/ link: follow them
 * once (public.accept_invite; they follow back only when the link had their
 * code), then a small note with Undo. Without the RPC it offers a plain
 * Follow. The remembered invite is cleared either way.
 */
export function InviteWelcome() {
  const { mode, user, profiles, refresh, isFollowing, toggleFollow } = useSocial();
  const [shown, setShown] = useState<{ outcome: Exclude<InviteOutcome, "none">; inviter: Inviter } | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ profiles, isFollowing, refresh });
  const userId = user?.id ?? null;

  useEffect(() => {
    latest.current = { profiles, isFollowing, refresh };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId || started.current) return;
    const store = inviteStore();
    const invite = store ? readInvite(store) : null;
    if (!store || !invite) return;
    const handle = invite.username;
    started.current = true;
    // Once only, whatever happens next.
    clearInvite(store);
    void (async () => {
      const supabase = mode === "supabase" ? await loadSupabaseBrowser() : null;
      const result = await acceptInvite(supabase, handle, invite.code);
      if (result === "failed" || result === "skipped") return;
      if (result !== "missing") await latest.current.refresh().catch(() => undefined);
      const inviter = await findInviter(handle, latest.current.profiles).catch(() => null);
      if (!inviter || inviter.id === userId || !mounted.current) return;
      const outcome = inviteOutcome(result, latest.current.isFollowing(inviter.id));
      if (outcome !== "none") setShown({ outcome, inviter });
    })();
  }, [mode, userId]);

  if (!shown) return null;
  const { outcome, inviter } = shown;
  return (
    <InviteWelcomeNote
      outcome={outcome}
      inviter={inviter}
      onUndo={() => {
        if (isFollowing(inviter.id)) void toggleFollow(inviter.id);
        setShown(null);
      }}
      onDismiss={() => setShown(null)}
    />
  );
}

/** The note itself: who invited you, and Undo (mutual, following) or Follow (prompt). */
export function InviteWelcomeNote({
  outcome,
  inviter,
  onUndo,
  onDismiss,
}: {
  outcome: Exclude<InviteOutcome, "none">;
  inviter: Inviter;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const name = inviter.displayName;
  return (
    <div
      role="status"
      data-invite-welcome={outcome}
      className="mb-6 flex items-start gap-3 rounded-2xl border border-violet-500/25 bg-violet-600/[0.07] py-3 pr-1 pl-3 motion-safe:animate-[pill-in_260ms_cubic-bezier(0.2,0.7,0.2,1)_both] dark:border-violet-400/20 dark:bg-violet-500/10"
    >
      <Avatar name={name} image={inviter.avatarUrl} expandable={false} className="mt-0.5 h-11 w-11 shrink-0" />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[14px] leading-5">
          {outcome === "mutual" ? (
            <>
              You&apos;re following <b className="font-bold">{name}</b>, and they follow you back.
            </>
          ) : outcome === "following" ? (
            <>
              You&apos;re following <b className="font-bold">{name}</b>.
            </>
          ) : (
            <>
              <b className="font-bold">{name}</b> invited you. Follow them to see their pickups.
            </>
          )}
        </p>
        <div className="mt-2">
          {outcome !== "prompt" ? (
            <button
              type="button"
              onClick={onUndo}
              className="-ml-3 min-h-11 rounded-full px-3 text-[14px] font-semibold text-violet-700 hover:bg-violet-600/10 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:text-[#A78BFA]"
            >
              Undo
            </button>
          ) : (
            <FollowButton userId={inviter.id} />
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:hover:bg-white/10"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
