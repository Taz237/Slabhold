"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw, Share, UserPlus } from "lucide-react";
import { replaceInviteCode, useInviteCode, useInviteShare } from "@/components/invite/invite-button";
import { useSocial } from "@/components/social-provider";
import { EmptyState } from "@/components/status";
import { loginPath } from "@/lib/auth/safe-next";
import { resetInviteCode, resetNotice } from "@/lib/invites/code";
import { invitePath } from "@/lib/share/links";
import { SITE_URL } from "@/lib/site-url";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const card = "rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-white/[0.04] dark:ring-white/10";
const sectionLabel = "px-1 pb-2 font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase";
const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/** "slabhold.app/i/maya?c=…": the link as people will see it, without the scheme. */
export function displayInviteLink(username: string, code: string | null): string {
  return `${SITE_URL.replace(/^https?:\/\//, "")}${invitePath(username, code)}`;
}

/** Confirm before the old link stops working. A bottom sheet on phones, centered on larger screens. */
export function ResetLinkSheet({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-end bg-black/60 motion-safe:animate-[lightbox-fade_150ms_ease-out] sm:place-items-center"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-reset-invite-sheet=""
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl border-t border-zinc-200 bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <h2 id={titleId} className="text-lg font-bold tracking-tight">
          Get a new link?
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Your current link stops working right away. Anyone who already joined stays connected.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`min-h-11 rounded-full border border-zinc-300 px-4 text-sm font-bold disabled:opacity-50 dark:border-white/20 ${focusRing}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-full bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-60 ${focusRing}`}
          >
            {busy ? "Getting link…" : "Get new link"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Settings > Invite friends: your invite link, Share, and "Get a new link",
 * which kills the old one at once (public.reset_invite_code, 3 a day).
 */
export function InviteSettings() {
  const { mode, user } = useSocial();
  const pathname = usePathname();
  const hosted = mode === "supabase" && Boolean(user);
  const { code, loading } = useInviteCode();
  const { share, sheet } = useInviteShare(user?.username ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  if (!user) {
    return (
      <EmptyState title="Invite friends" detail="Log in to get your invite link.">
        <Link href={loginPath(pathname)} className="text-sm font-bold">
          Log in
        </Link>
      </EmptyState>
    );
  }

  async function onConfirm() {
    if (!user || busy) return;
    setBusy(true);
    const result = await resetInviteCode(createSupabaseBrowser());
    if (result.kind === "ok") replaceInviteCode(user.id, result.code);
    setNotice({ text: resetNotice(result), ok: result.kind === "ok" });
    setBusy(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invite friends</h1>
        <p className="mt-1.5 text-sm text-zinc-500">Bring a collector to Slabhold with your own link.</p>
      </div>
      <section>
        <h2 className={sectionLabel}>Your invite link</h2>
        <div className={`${card} p-4`}>
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-700 dark:text-[#A78BFA]"
            >
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold tracking-tight">Invite a collector</p>
              <p className="mt-0.5 text-sm leading-5 text-zinc-500">
                When someone joins with your link, you follow each other.
              </p>
            </div>
          </div>
          <div className="mt-3 flex h-10 items-center rounded-xl bg-zinc-100 px-3 dark:bg-white/[0.06]">
            {hosted && loading ? (
              <span aria-hidden className="h-3.5 w-48 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            ) : (
              <p data-invite-link="" className="min-w-0 truncate font-mono text-[12px] text-zinc-600 dark:text-zinc-300">
                {displayInviteLink(user.username, code)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void share()}
            className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-bold text-white ${focusRing}`}
          >
            <Share aria-hidden className="h-4 w-4" />
            Share invite link
          </button>
        </div>
      </section>

      {hosted ? (
        <section>
          <h2 className={sectionLabel}>Reset</h2>
          <div className={`${card} p-4`}>
            <p className="text-sm leading-5 text-zinc-500">
              Shared your link somewhere you shouldn&apos;t have? Get a new one. The old link stops working right
              away.
            </p>
            <button
              type="button"
              data-reset-invite=""
              onClick={() => {
                setNotice(null);
                setConfirming(true);
              }}
              className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm font-bold dark:border-white/20 ${focusRing}`}
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              Get a new link
            </button>
            <p
              role="status"
              className={`mt-2 min-h-5 text-sm ${notice?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}
            >
              {notice?.text ?? ""}
            </p>
          </div>
        </section>
      ) : null}

      {confirming ? (
        <ResetLinkSheet busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void onConfirm()} />
      ) : null}
      {sheet}
    </div>
  );
}
