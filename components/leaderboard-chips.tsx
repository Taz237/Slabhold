"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

const PILL: Record<string, string> = {
  "top-card-post": "bg-[#7c5cff] text-white shadow-[0_0_18px_rgba(124,92,255,0.55)]",
  "rising-collectors": "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]",
  "most-cards-added": "bg-teal-500 text-white shadow-[0_0_18px_rgba(20,184,166,0.45)]",
};

function ChipFace({ tab }: { tab: { id: string; label: string; active: boolean } }) {
  const { pending } = useLinkStatus();
  const active = tab.active || pending;
  return (
    <span
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
        active ? (PILL[tab.id] ?? PILL["top-card-post"]) : "bg-white/10 text-zinc-300"
      }`}
    >
      {tab.label}
    </span>
  );
}

/** Horizontal chip row. Scrolls the active board into view without moving the page. */
export function LeaderboardChips({
  tabs,
}: {
  tabs: readonly { id: string; label: string; href: string; active: boolean }[];
}) {
  const row = useRef<HTMLDivElement>(null);
  const serverActive = tabs.find((tab) => tab.active)?.id ?? "";

  useEffect(() => {
    const root = row.current;
    if (!root) return;
    const current = root.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const rootBox = root.getBoundingClientRect();
    const chipBox = current.getBoundingClientRect();
    const delta = chipBox.left - rootBox.left - (root.clientWidth - chipBox.width) / 2;
    root.scrollLeft = Math.max(0, root.scrollLeft + delta);
  }, [serverActive]);

  return (
    <div
      ref={row}
      className="relative z-[1] flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3"
      data-board-tabs=""
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          data-board={tab.id}
          draggable={false}
          className="relative inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-full"
        >
          <ChipFace tab={tab} />
        </Link>
      ))}
    </div>
  );
}
