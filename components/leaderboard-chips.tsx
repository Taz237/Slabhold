"use client";

import Link, { useLinkStatus } from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const PILL: Record<string, string> = {
  "top-card-post": "bg-[#7c5cff] text-white shadow-[0_0_18px_rgba(124,92,255,0.55)]",
  "rising-collectors": "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]",
  "most-cards-added": "bg-teal-500 text-white shadow-[0_0_18px_rgba(20,184,166,0.45)]",
};

const INACTIVE = "bg-white/10 text-zinc-300";

function ChipPending({
  id,
  onPending,
}: {
  id: string;
  onPending: (id: string, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    onPending(id, true);
    const board = document.querySelector("[data-leaderboard]");
    board?.setAttribute("data-board-pending", "");
    return () => {
      onPending(id, false);
      board?.removeAttribute("data-board-pending");
    };
  }, [id, pending, onPending]);
  return null;
}

/** Horizontal chip row. Scrolls the active board into view without moving the page. */
export function LeaderboardChips({
  tabs,
}: {
  tabs: readonly { id: string; label: string; href: string; active: boolean }[];
}) {
  const row = useRef<HTMLDivElement>(null);
  const serverActive = tabs.find((tab) => tab.active)?.id ?? "";
  const [pendingId, setPendingId] = useState<string | null>(null);
  const onPending = useCallback((id: string, pending: boolean) => {
    setPendingId((current) => {
      if (pending) return current === id ? current : id;
      return current === id ? null : current;
    });
  }, []);
  const focusId = pendingId ?? serverActive;

  useEffect(() => {
    const root = row.current;
    if (!root) return;
    const current = root.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const rootBox = root.getBoundingClientRect();
    const chipBox = current.getBoundingClientRect();
    const delta = chipBox.left - rootBox.left - (root.clientWidth - chipBox.width) / 2;
    root.scrollLeft = Math.max(0, root.scrollLeft + delta);
  }, [focusId]);

  return (
    <div
      ref={row}
      className="relative z-[1] flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3"
      data-board-tabs=""
    >
      {tabs.map((tab) => {
        const highlighted = pendingId ? tab.id === pendingId : tab.active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={highlighted ? "page" : undefined}
            data-board={tab.id}
            draggable={false}
            className={`relative inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
              highlighted ? (PILL[tab.id] ?? PILL["top-card-post"]) : INACTIVE
            }`}
          >
            <ChipPending id={tab.id} onPending={onPending} />
            {tab.id === pendingId ? (
              <span
                aria-hidden="true"
                className="lb-chip-spin mr-1.5 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-white/40 border-t-white"
              />
            ) : null}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
