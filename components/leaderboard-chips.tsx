"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const PILL: Record<string, string> = {
  "top-card-post": "bg-[#7c5cff] text-white shadow-[0_0_18px_rgba(124,92,255,0.55)]",
  "rising-collectors": "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]",
  "most-cards-added": "bg-teal-500 text-white shadow-[0_0_18px_rgba(20,184,166,0.45)]",
};

/** Horizontal chip row. Scrolls the active board into view without moving the page. */
export function LeaderboardChips({
  tabs,
}: {
  tabs: readonly { id: string; label: string; href: string; active: boolean }[];
}) {
  const row = useRef<HTMLDivElement>(null);
  const serverActive = tabs.find((tab) => tab.active)?.id ?? "";
  const [picked, setPicked] = useState<{ id: string; from: string } | null>(null);
  const activeId = picked && picked.from === serverActive ? picked.id : serverActive;

  useEffect(() => {
    const root = row.current;
    if (!root) return;
    const current = root.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const rootBox = root.getBoundingClientRect();
    const chipBox = current.getBoundingClientRect();
    const delta = chipBox.left - rootBox.left - (root.clientWidth - chipBox.width) / 2;
    root.scrollLeft = Math.max(0, root.scrollLeft + delta);
  }, [activeId]);

  return (
    <div
      ref={row}
      className="flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3"
      data-board-tabs=""
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-board={tab.id}
            onClick={() => {
              if (tab.id === serverActive) return;
              setPicked({ id: tab.id, from: serverActive });
            }}
            className={`inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
              active ? (PILL[tab.id] ?? PILL["top-card-post"]) : "bg-white/10 text-zinc-300"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
