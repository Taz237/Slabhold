"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { useVouchStatus } from "@/components/use-vouch-store";
import { useVouchGate } from "@/components/use-vouch-summary";
import { TrustLine } from "@/components/vouches/trust-line";
import { VouchSheet } from "@/components/vouches/vouch-sheet";
import { hasConfirmedDealWith } from "@/lib/vouches/page";
import { VOUCH_COPY, vouchButtonHidden, vouchHintCopy } from "@/lib/vouches/rules";
import type { VouchStatus } from "@/lib/vouches/types";

const bar = "shrink-0 border-b border-zinc-200/80 px-4 dark:border-white/[0.08]";
const vouchButton =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-violet-700 transition-opacity duration-150 active:opacity-70 motion-reduce:transition-none dark:text-[#A78BFA]";

/**
 * What the right side of the bar shows:
 *   - Vouch / Edit vouch once the database says the reader can;
 *   - a short, quiet reason when they can't yet (never an error);
 *   - nothing while the answer loads, or when there is nothing useful to say.
 */
export function vouchBarAction(status: VouchStatus | null, username: string): { kind: "button"; label: string } | { kind: "reason"; text: string } | { kind: "none" } | { kind: "hidden" } {
  if (!status) return { kind: "none" };
  // Blocked, either way: the whole bar goes.
  if (status.reason === "vouch_blocked") return { kind: "hidden" };
  if (status.canVouch) return { kind: "button", label: status.mine ? VOUCH_COPY.editVouch : VOUCH_COPY.vouch };
  if (!status.reason || vouchButtonHidden(status.reason) || status.reason === "vouch_signed_out") return { kind: "none" };
  return { kind: "reason", text: vouchHintCopy(status.reason, username) };
}

/** The bar as drawn, from a status already in hand. */
export function VouchThreadBarRow({ partner, status, onVouch, onWarm }: { partner: { id: string; username: string }; status: VouchStatus | null; onVouch: () => void; onWarm?: () => void }) {
  const action = vouchBarAction(status, partner.username);
  if (action.kind === "hidden") return null;
  return (
    <div role="group" aria-label={VOUCH_COPY.barLabel(partner.username)} data-vouch-bar="" className={bar}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0 [&>*]:mt-0">
          <TrustLine userId={partner.id} username={partner.username} />
        </div>
        {action.kind === "button" ? (
          <button type="button" onClick={onVouch} onPointerDown={onWarm} onFocus={onWarm} className={vouchButton}>
            {action.label}
          </button>
        ) : null}
      </div>
      {/* The reason gets its own line under their vouches: side by side, both wrap at phone width. */}
      {action.kind === "reason" ? <p className="-mt-1.5 pb-2 text-13 leading-5 text-zinc-500">{action.text}</p> : null}
    </div>
  );
}

export function VouchThreadBarView({ partner }: { partner: { id: string; username: string } }) {
  const { user } = useSocial();
  const { supported, pending } = useVouchGate();
  const status = useVouchStatus(partner.id);
  const [open, setOpen] = useState(false);
  const [loggedDeal, setLoggedDeal] = useState(false);

  // The Logged deal tag: only looked up once the sheet opens, from the reader's own deal log.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void import("@/lib/deals/client")
      .then((deals) => deals.listMyDeals())
      .then((result) => {
        if (!cancelled && !("error" in result)) setLoggedDeal(hasConfirmedDealWith(result.deals, user.id, partner.id));
      })
      .catch(() => {
        // No tag shown: the vouch itself still gets it from the database.
      });
    return () => {
      cancelled = true;
    };
  }, [open, partner.id, user]);

  // No vouches in this database: no bar. Still finding out: the bar's height, so nothing jumps.
  if (!supported) return pending ? <div aria-hidden="true" className={`${bar} min-h-11`} /> : null;

  return (
    <>
      <VouchThreadBarRow partner={partner} status={status} onVouch={() => setOpen(true)} onWarm={VouchSheet.warm} />
      {open ? <VouchSheet subject={partner} mine={status?.mine ?? null} hasLoggedDeal={loggedDeal} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
