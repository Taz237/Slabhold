"use client";

import { useState } from "react";
import { formatDate, money } from "@/lib/format";
import {
  FLAG_REASONS,
  flagReasonLabel,
  showHiddenSales,
  type FlagReason,
} from "@/lib/comps/flag-reasons";
import type { CompListing } from "@/lib/types";
import type { HiddenSale } from "@/components/use-comp-flags";

export function CompsList({
  comps,
  cardId,
  canFlag = false,
  hidden = [],
  onFlag,
  onRestore,
  toastItemId,
  onUndo,
}: {
  comps: CompListing[];
  cardId?: string;
  userId?: string | null;
  canFlag?: boolean;
  hidden?: HiddenSale[];
  onFlag?: (comp: CompListing, reason: FlagReason) => Promise<boolean>;
  onRestore?: (itemId: string) => Promise<boolean>;
  toastItemId?: string | null;
  onUndo?: () => void;
}) {
  const [pending, setPending] = useState<CompListing | null>(null);
  const [reason, setReason] = useState<FlagReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function hideSale() {
    if (!pending || !reason || !onFlag) return;
    setBusy(true);
    setError(null);
    const ok = await onFlag(pending, reason);
    setBusy(false);
    if (!ok) {
      setError("Couldn't hide that sale.");
      return;
    }
    setPending(null);
    setReason("");
  }

  return (
    <div>
      {comps.length ? (
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {comps.map((comp) => (
            <li key={comp.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                {comp.url ? (
                  <a
                    href={comp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {comp.title || "View listing"}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">
                    {comp.title || "Sale"}
                  </p>
                )}
                <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                  {formatDate(comp.soldDate)}
                  {comp.condition && comp.condition !== "—" ? ` · ${comp.condition}` : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-medium tabular-nums">{money(comp.soldPrice, true)}</p>
                {canFlag && cardId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPending(comp);
                      setReason("");
                      setError(null);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Not a match
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No recent sales found</p>
      )}

      {showHiddenSales(canFlag, hidden.length) ? (
        <details className="mt-4 rounded-xl border border-zinc-200 px-3 py-2 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">
            Hidden sales ({hidden.length})
          </summary>
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
            {hidden.map((sale) => (
              <li key={sale.itemId} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">{sale.title || "Sale"}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {sale.price != null ? money(sale.price) : "—"}
                    {sale.soldAt ? ` · ${formatDate(sale.soldAt.slice(0, 10))}` : ""}
                    {` · ${flagReasonLabel(sale.reason)}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={restoring === sale.itemId}
                  onClick={() => {
                    if (!onRestore) return;
                    setRestoring(sale.itemId);
                    void onRestore(sale.itemId).finally(() => setRestoring(null));
                  }}
                  className="shrink-0 text-xs font-semibold text-violet-700 hover:underline disabled:opacity-40 dark:text-violet-300"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {pending ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hide-sale-title"
            className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-zinc-950"
          >
            <h2 id="hide-sale-title" className="text-lg font-bold">
              Hide this sale?
            </h2>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
              {pending.title || "Sale"}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{money(pending.soldPrice)}</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-medium text-zinc-500">Why isn't this a match?</legend>
              {FLAG_REASONS.map(([id, label]) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="flag-reason"
                    value={id}
                    checked={reason === id}
                    onChange={() => setReason(id)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setReason("");
                  setError(null);
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-bold dark:border-white/20"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason || busy}
                onClick={() => void hideSale()}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
              >
                {busy ? "Hiding…" : "Hide sale"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastItemId ? (
        <p
          role="status"
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
        >
          Sale hidden ·{" "}
          <button type="button" onClick={onUndo} className="underline">
            Undo
          </button>
        </p>
      ) : null}
    </div>
  );
}
