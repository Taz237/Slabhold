"use client";

import { useEffect, useState } from "react";
import { formatDate, money } from "@/lib/format";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { CompListing } from "@/lib/types";

export function CompsList({
  comps,
  cardId,
  userId,
  canFlag = false,
  flaggedIds,
  onFlagged,
}: {
  comps: CompListing[];
  cardId?: string;
  userId?: string | null;
  /** Signed-in owner only. Other viewers and signed-out users never see the control. */
  canFlag?: boolean;
  flaggedIds?: Set<string>;
  onFlagged?: (itemId: string) => void;
}) {
  const [localHidden, setLocalHidden] = useState<Set<string>>(new Set());
  const [flagging, setFlagging] = useState<string | null>(null);
  const hidden = flaggedIds ?? localHidden;

  useEffect(() => {
    if (!canFlag || !userId || !cardId || flaggedIds) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;

    let cancelled = false;
    supabase
      .from("comp_flags")
      .select("item_id")
      .eq("card_id", cardId)
      .eq("user_id", userId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setLocalHidden(new Set(data.map((row) => row.item_id as string)));
      });

    return () => {
      cancelled = true;
    };
  }, [canFlag, userId, cardId, flaggedIds]);

  const visible = comps.filter((comp) => !hidden.has(comp.itemId));

  async function flagNotAMatch(comp: CompListing) {
    if (!canFlag || !cardId) return;
    setFlagging(comp.itemId);
    try {
      const res = await fetch("/api/comps/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, itemId: comp.itemId }),
      });
      if (!res.ok) return;
      if (!flaggedIds) setLocalHidden((prev) => new Set(prev).add(comp.itemId));
      onFlagged?.(comp.itemId);
    } finally {
      setFlagging(null);
    }
  }

  if (!visible.length) {
    return <p className="text-sm text-zinc-500">No recent sales found</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
      {visible.map((comp) => (
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
              {comp.condition && comp.condition !== "—"
                ? ` · ${comp.condition}`
                : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-sm font-medium tabular-nums">
              {money(comp.soldPrice, true)}
            </p>
            {canFlag && cardId ? (
              <button
                type="button"
                disabled={flagging === comp.itemId}
                onClick={() => flagNotAMatch(comp)}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Not a match
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
