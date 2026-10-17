"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteReportTarget, hideReportPost, markReportReviewed } from "@/lib/safety/actions";

export function ReportActions({
  reportId,
  canModeratePost,
  canDelete,
}: {
  reportId: string;
  canModeratePost: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: (id: string) => Promise<{ error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await action(reportId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(markReportReviewed)}
        className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-bold disabled:opacity-50 dark:border-white/20"
      >
        Mark reviewed
      </button>
      {canModeratePost ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(hideReportPost)}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-bold disabled:opacity-50 dark:border-white/20"
        >
          Hide post
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(deleteReportTarget)}
          className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {canModeratePost ? "Delete post" : "Delete reply"}
        </button>
      ) : null}
      {error ? <p className="w-full text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
