"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDate, money } from "@/lib/format";
import {
  FLAG_REASONS,
  flagReasonLabel,
  showHiddenSales,
  type FlagReason,
} from "@/lib/comps/flag-reasons";
import type { CompListing } from "@/lib/types";
import type { CompFlagToast, HiddenSale } from "@/components/use-comp-flags";

const SALES_PAGE = 10;

export function CompsList({
  comps,
  cardId,
  canFlag = false,
  hidden = [],
  onFlag,
  onRestore,
  toast = null,
  onUndo,
}: {
  comps: CompListing[];
  cardId?: string;
  userId?: string | null;
  canFlag?: boolean;
  hidden?: HiddenSale[];
  onFlag?: (comp: CompListing, reason: FlagReason) => Promise<boolean>;
  onRestore?: (itemId: string) => Promise<boolean>;
  toast?: CompFlagToast | null;
  onUndo?: () => void;
}) {
  const [pending, setPending] = useState<CompListing | null>(null);
  const [reason, setReason] = useState<FlagReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const compKey = comps.map((comp) => comp.itemId).join("\n");
  const [shownState, setShownState] = useState({ key: compKey, shown: SALES_PAGE });
  if (shownState.key !== compKey) {
    setShownState({ key: compKey, shown: SALES_PAGE });
  }
  const shown = shownState.key === compKey ? shownState.shown : SALES_PAGE;

  function showMore() {
    setShownState({ key: compKey, shown: shown + SALES_PAGE });
  }

  const rows = comps.slice(0, shown);

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
          {rows.map((comp) => (
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
              <div className="flex shrink-0 items-center gap-1">
                <p className="text-sm font-medium tabular-nums">{money(comp.soldPrice, true)}</p>
                {canFlag && cardId ? (
                  <RowMenu
                    label={`Actions for ${comp.title || "sale"}`}
                    items={[
                      {
                        id: "not-a-match",
                        label: "Not a match",
                        onSelect: () => {
                          setPending(comp);
                          setReason("");
                          setError(null);
                        },
                      },
                    ]}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No recent sales found</p>
      )}
      {shown < comps.length ? (
        <button
          type="button"
          onClick={showMore}
          className="mt-3 text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          Show more
        </button>
      ) : null}

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
                <RowMenu
                  label={`Actions for ${sale.title || "hidden sale"}`}
                  items={[
                    {
                      id: "restore",
                      label: restoring === sale.itemId ? "Restoring…" : "Restore",
                      disabled: restoring === sale.itemId || !onRestore,
                      onSelect: () => {
                        if (!onRestore) return;
                        setRestoring(sale.itemId);
                        void onRestore(sale.itemId).finally(() => setRestoring(null));
                      },
                    },
                  ]}
                />
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
              <legend className="text-xs font-medium text-zinc-500">
                {"Why isn't this a match?"}
              </legend>
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

      {toast ? (
        <p
          role="status"
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
        >
          {toast.kind === "hidden" ? (
            <>
              Sale hidden ·{" "}
              <button type="button" onClick={onUndo} className="underline">
                Undo
              </button>
            </>
          ) : (
            "Sale restored"
          )}
        </p>
      ) : null}
    </div>
  );
}

function RowMenu({
  label,
  items,
}: {
  label: string;
  items: { id: string; label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  function closeAndFocusButton() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusButton();
      return;
    }
    const buttons = itemRefs.current.filter((node): node is HTMLButtonElement => Boolean(node));
    const index = buttons.findIndex((node) => node === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="grid h-7 w-7 place-items-center rounded-full text-base leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="absolute right-0 z-20 mt-1 min-w-36 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-zinc-950"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
