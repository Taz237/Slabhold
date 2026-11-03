"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/safety-menu";
import {
  deleteReportTarget,
  hideReportPost,
  markReportReviewed,
  suspendReportUser,
} from "@/lib/safety/actions";

const outline =
  "inline-flex min-h-11 items-center rounded-full border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-50 dark:border-white/20";

/** "@name" from the reports list, or a plain fallback when the profile is gone. */
export function suspendTitle(reported: string): string {
  return reported.startsWith("@") ? `Suspend ${reported}?` : "Suspend this account?";
}

export const SUSPEND_BODY = "They can't log in and their posts are hidden";

export function ReportActions({
  reportId,
  reported,
  canModeratePost,
  canDelete,
}: {
  reportId: string;
  reported: string;
  canModeratePost: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run(action: (id: string) => Promise<{ error?: string }>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const result = await action(reportId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(markReportReviewed)}
        className={outline}
      >
        Mark reviewed
      </button>
      {canModeratePost ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(hideReportPost)}
          className={outline}
        >
          Hide post
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(deleteReportTarget)}
          className="inline-flex min-h-11 items-center rounded-full bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {canModeratePost ? "Delete post" : "Delete reply"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className={`${outline} text-rose-600`}
      >
        Suspend account
      </button>
      {error && !confirming ? <p className="w-full text-sm text-rose-600">{error}</p> : null}
      {confirming ? (
        <ConfirmDialog
          title={suspendTitle(reported)}
          body={SUSPEND_BODY}
          confirm="Suspend"
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirming(false);
            setError(null);
          }}
          onConfirm={() =>
            void run(suspendReportUser).then((done) => {
              if (done) setConfirming(false);
            })
          }
        />
      ) : null}
    </div>
  );
}
