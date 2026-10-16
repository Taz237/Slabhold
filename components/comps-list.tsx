"use client";

import { useEffect, useState } from "react";
import { formatDate, money } from "@/lib/format";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { CompListing } from "@/lib/types";

export function CompsList({
  comps,
  cardId,
  userId,
  flaggedIds,
  onFlagged,
}: {
  comps: CompListing[];
  cardId?: string;
  userId?: string | null;
  flaggedIds?: Set<string>;
  onFlagged?: (itemId: string) => void;
}) {
  const [localHidden, setLocalHidden] = useState<Set<string>>(new Set());
  const [flagging, setFlagging] = useState<string | null>(null);
  const hidden = flaggedIds ?? localHidden;

  useEffect(() => {
    if (!userId || !cardId || flaggedIds) return;
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
  }, [userId, cardId, flaggedIds]);

  const visible = comps.filter((comp) => !hidden.has(comp.itemId));

  async function flagNotAMatch(comp: CompListing) {
    if (!userId || !cardId) return;
    if (!flaggedIds) setLocalHidden((prev) => new Set(prev).add(comp.itemId));
    onFlagged?.(comp.itemId);
    setFlagging(comp.itemId);
    try {
      const supabase = createSupabaseBrowser();
      if (!supabase) return;
      await supabase.from("comp_flags").upsert(
        {
          user_id: userId,
          card_id: cardId,
          item_id: comp.itemId,
        },
        { onConflict: "user_id,card_id,item_id" },
      );
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
            <p className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatDate(comp.soldDate)}
              {comp.condition && comp.condition !== "—" ? (
                <span className="text-zinc-500"> · {comp.condition}</span>
              ) : null}
            </p>
            {comp.url ? (
              <a
                href={comp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-xs text-violet-700 hover:underline dark:text-violet-300"
              >
                View listing
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-sm font-medium tabular-nums">
              {money(comp.soldPrice, true)}
            </p>
            {userId && cardId ? (
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
