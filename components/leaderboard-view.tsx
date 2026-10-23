"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ShareAction } from "@/components/share-button";
import { pct, signedMoney } from "@/lib/format";
import { rankLeaderboard } from "@/lib/leaderboard/math";
import { ESTIMATED_FROM_SOLD, rankShareText } from "@/lib/leaderboard/share";
import type { LeaderboardEntry, LeaderboardModel } from "@/lib/leaderboard/types";
import { userHref } from "@/lib/social/user-href";

type WindowId = "day" | "week";
type Direction = "gainers" | "losers";

function tone(percent: number): string {
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  if (percent < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-500";
}

export function LeaderboardView({ model }: { model: LeaderboardModel }) {
  const [windowId, setWindowId] = useState<WindowId>("day");
  const [direction, setDirection] = useState<Direction>("gainers");
  const window = windowId === "week" ? model.week : model.day;
  const ranked = useMemo(
    () => (window.open ? rankLeaderboard(window.rows, direction) : []),
    [direction, window.open, window.rows],
  );
  const mine = ranked.find((row) => row.userId === model.viewerUserId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-zinc-500">{model.dateLabel}</p>
      </div>

      <div className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-white/10" role="tablist" aria-label="Leaderboard range">
        <TabButton selected={windowId === "day"} onClick={() => setWindowId("day")}>
          Day
        </TabButton>
        <TabButton selected={windowId === "week"} onClick={() => setWindowId("week")}>
          Week
        </TabButton>
      </div>

      <div className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-white/10" role="tablist" aria-label="Gainers or losers">
        <TabButton selected={direction === "gainers"} onClick={() => setDirection("gainers")}>
          Gainers
        </TabButton>
        <TabButton selected={direction === "losers"} onClick={() => setDirection("losers")}>
          Losers
        </TabButton>
      </div>

      {window.open ? (
        ranked.length > 0 ? (
          <ol className="divide-y divide-zinc-200 rounded-3xl border border-zinc-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
            {ranked.map((row) => (
              <li key={row.userId}>
                <LeaderboardRow row={row} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-3xl border border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-white/10">
            No collectors to show.
          </p>
        )
      ) : (
        <p className="rounded-3xl border border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">
          {window.message}
        </p>
      )}

      {mine ? (
        <section
          aria-label="Share my rank"
          className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <p className="text-sm font-semibold">Share my rank</p>
          <p className="mt-2 text-base font-bold tracking-tight">
            {rankShareText({
              username: mine.username,
              percent: mine.percent,
              window: windowId,
            })}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{ESTIMATED_FROM_SOLD}</p>
          <ShareAction
            path="/leaderboard"
            title={rankShareText({
              username: mine.username,
              percent: mine.percent,
              window: windowId,
            })}
            text={rankShareText({
              username: mine.username,
              percent: mine.percent,
              window: windowId,
            })}
          />
        </section>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">{model.note}</p>
    </div>
  );
}

function LeaderboardRow({
  row,
}: {
  row: LeaderboardEntry & { rank: number };
}) {
  return (
    <Link href={userHref(row.username)} className="flex min-h-11 items-center gap-3 px-3 py-2">
      <span className="w-6 shrink-0 text-sm font-bold tabular-nums text-zinc-500">{row.rank}</span>
      <Avatar
        name={row.displayName}
        image={row.avatarUrl}
        accent={row.accent}
        expandable={false}
        className="h-9 w-9"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">@{row.username}</span>
        <span className="block text-xs text-zinc-500">
          {row.cardCount} card{row.cardCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-sm font-semibold tabular-nums ${tone(row.percent)}`}>
          {pct(row.percent)}
        </span>
        <span className={`block text-xs font-semibold tabular-nums ${tone(row.delta)}`}>
          {signedMoney(row.delta)}
        </span>
      </span>
    </Link>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`min-h-11 rounded-full px-2 text-sm font-bold ${
        selected
          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
          : "text-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}
