"use client";

import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import { useCloseOnOutsideTap } from "@/lib/ui/menu-outside-tap";
import {
  blockAccount,
  muteAccount,
  submitReport,
  unblockAccount,
  unmuteAccount,
} from "@/lib/safety/actions";
import { REPORT_REASONS, type ReportTargetType } from "@/lib/safety/report";

const menuItem =
  "block w-full px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 dark:hover:bg-white/10";

export function SafetyMenu({
  targetType,
  targetId,
  reportedUserId,
  username,
}: {
  targetType: ReportTargetType;
  targetId: string;
  reportedUserId: string;
  username: string;
}) {
  const { user, blockedIds, mutedIds, applySafetyChange, refresh } = useSocial();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"report" | "block" | "mute" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const blocked = blockedIds.includes(reportedUserId);
  const muted = mutedIds.includes(reportedUserId);

  useCloseOnOutsideTap(open, rootRef, () => setOpen(false));

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!user || user.id === reportedUserId) return null;

  const reportLabel =
    targetType === "user" ? "Report user" : targetType === "reply" ? "Report reply" : "Report post";

  async function afterChange(type: "block" | "unblock" | "mute" | "unmute") {
    applySafetyChange({ type, userId: reportedUserId });
    // Block and mute already took their posts, replies and notices off in place.
    // Unblock and unmute need a read to bring them back.
    if (type === "unblock" || type === "unmute") await refresh();
  }

  async function onReport(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await submitReport({
      targetType,
      targetId,
      reportedUserId,
      reason,
      details,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDialog(null);
    setReason("");
    setDetails("");
    setToast("Thanks, we'll review it");
  }

  async function onBlock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = blocked ? await unblockAccount(reportedUserId) : await blockAccount(reportedUserId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDialog(null);
    await afterChange(blocked ? "unblock" : "block");
  }

  async function onMute() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = muted ? await unmuteAccount(reportedUserId) : await muteAccount(reportedUserId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDialog(null);
    if (!muted) setToast(`You won't see posts from @${username}`);
    await afterChange(muted ? "unmute" : "mute");
  }

  return (
    <div ref={rootRef} className="relative -mt-1 shrink-0">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
      >
        <Ellipsis className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-9 right-0 z-30 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => {
              setOpen(false);
              setError(null);
              setDialog("report");
            }}
          >
            {reportLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => {
              setOpen(false);
              setError(null);
              if (muted) void onMute();
              else setDialog("mute");
            }}
          >
            {muted ? `Unmute @${username}` : `Mute @${username}`}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${menuItem} text-rose-600`}
            onClick={() => {
              setOpen(false);
              setError(null);
              if (blocked) void onBlock();
              else setDialog("block");
            }}
          >
            {blocked ? `Unblock @${username}` : `Block @${username}`}
          </button>
        </div>
      ) : null}

      {dialog === "report" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onSubmit={(event) => void onReport(event)}
            className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-950"
          >
            <h2 id="report-title" className="text-lg font-bold">
              {reportLabel}
            </h2>
            <fieldset className="mt-3 space-y-2">
              <legend className="text-sm font-medium">Reason</legend>
              {REPORT_REASONS.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={item.id}
                    checked={reason === item.id}
                    onChange={() => setReason(item.id)}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-4 block text-sm font-medium" htmlFor={`details-${targetId}`}>
              Details (optional)
            </label>
            <textarea
              id={`details-${targetId}`}
              value={details}
              maxLength={500}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/10"
            />
            <p className="mt-1 text-xs text-zinc-500">{details.length}/500</p>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-bold dark:border-white/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !reason}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "block" ? (
        <ConfirmDialog
          title={`Block @${username}?`}
          body="You won't see each other's posts, replies, or notifications. Follows between you are removed. You can unblock later, but follows won't come back."
          confirm="Block"
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={() => void onBlock()}
        />
      ) : null}

      {dialog === "mute" ? (
        <ConfirmDialog
          title={`Mute @${username}?`}
          body={`You won't see posts from @${username}. They won't know you muted them.`}
          confirm="Mute"
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={() => void onMute()}
        />
      ) : null}

      {toast ? (
        <p
          role="status"
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
        >
          {toast}
        </p>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirm,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirm: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-confirm-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-950"
      >
        <h2 id="safety-confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{body}</p>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-bold dark:border-white/20"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InteractionNote() {
  return <p className="text-sm text-zinc-500">You can&apos;t interact with this account.</p>;
}
