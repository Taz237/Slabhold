"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { ESTIMATED_FROM_SOLD } from "@/lib/leaderboard/value-share";
import {
  LEADERBOARD_HOW_TO,
  leaderboardChecklist,
  type LeaderboardChecklist,
} from "@/lib/leaderboard/requirements";
import type { LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import {
  readLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { trustedPublicTotals } from "@/lib/leaderboard/public-value";
import { VALUE_BOARD_TAB } from "@/lib/leaderboard/tab";
import type { ValueBoardModel, ValueBoardRow } from "@/lib/leaderboard/types";
import { userHref } from "@/lib/social/user-href";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { useCardValues } from "@/lib/value/use-card-values";

export { VALUE_BOARD_TAB };

function tone(percent: number): string {
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  if (percent < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-500";
}

export function ValueBoardView({
  model,
  checklist,
}: {
  model: ValueBoardModel;
  checklist: LeaderboardChecklist;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{VALUE_BOARD_TAB.label}</h1>
        <p className="mt-1 text-sm text-zinc-500">{model.weekLabel}</p>
      </div>

      <ValueBoardRequirements checklist={checklist} />

      {model.closedMessage ? (
        <p className="rounded-3xl border border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">
          {model.closedMessage}
        </p>
      ) : null}

      {model.emptyMessage ? (
        <p className="rounded-3xl border border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-white/10">
          {model.emptyMessage}
        </p>
      ) : null}

      {model.brackets.map((bracket) => (
        <section key={bracket.id} aria-label={bracket.label} className="space-y-2">
          <h2 className="text-sm font-bold">{bracket.label}</h2>
          <ol className="divide-y divide-zinc-200 rounded-3xl border border-zinc-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
            {bracket.rows.map((row) => (
              <li key={row.userId}>
                <ValueBoardRowView row={row} />
              </li>
            ))}
          </ol>
        </section>
      ))}

      <p className="text-xs leading-5 text-zinc-500">{ESTIMATED_FROM_SOLD}</p>
      <p className="text-xs leading-5 text-zinc-500">{model.note}</p>
    </div>
  );
}

function ValueBoardRowView({ row }: { row: ValueBoardRow }) {
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
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">@{row.username}</span>
      <span className="shrink-0 text-right">
        <span className={`block text-sm font-semibold tabular-nums ${tone(row.percent)}`}>
          {row.percentLabel}
        </span>
        {row.flagged ? (
          <span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">Flagged</span>
        ) : null}
      </span>
    </Link>
  );
}

export function ValueBoardRequirements({ checklist }: { checklist: LeaderboardChecklist }) {
  return (
    <details
      open={checklist.openByDefault}
      className="rounded-3xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <summary className="cursor-pointer text-sm font-bold">{LEADERBOARD_HOW_TO}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{checklist.line}</p>
        {checklist.status ? <p className="text-sm font-semibold">{checklist.status}</p> : null}
        <ul className="space-y-2 text-sm">
          {checklist.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2" data-met={item.met ? "yes" : "no"}>
              {checklist.showChecks ? (
                <span className={item.met ? "text-emerald-600" : "text-zinc-400"} aria-hidden>
                  {item.met ? "✓" : "X"}
                </span>
              ) : null}
              {checklist.showChecks ? (
                <span className="sr-only">{item.met ? "Met" : "Not yet"}</span>
              ) : null}
              {item.href ? (
                <Link href={item.href} className="font-semibold underline">
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-500">{checklist.sameCardsNote}</p>
      </div>
    </details>
  );
}

export function ValueBoard({
  model,
  minimums,
  accountCreatedAt,
}: {
  model: ValueBoardModel;
  minimums: LeaderboardMinimums;
  accountCreatedAt?: string | null;
}) {
  const { user } = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const cardIds = useMemo(() => (user ? cards.map((card) => card.id) : []), [cards, user]);
  const { values, loading: valuesLoading } = useCardValues(cardIds);
  const [optedIn, setOptedIn] = useState(false);
  const [optReady, setOptReady] = useState(false);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    let cancelled = false;
    void loadSupabaseBrowser().then((supabase) => {
      if (cancelled) return;
      if (!supabase) {
        // No Supabase config (local accounts): not opted in, so the checklist settles.
        setOptedIn(false);
        setOptReady(true);
        return;
      }
      void readLeaderboardOptIn(supabase as unknown as LeaderboardOptInDb, id).then((result) => {
        if (cancelled) return;
        setOptedIn(result.optedIn);
        setOptReady(true);
      });
    }).catch(() => {
      // supabase-js failed to load: count as not opted in, so the checklist settles.
      if (cancelled) return;
      setOptedIn(false);
      setOptReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const totals = useMemo(() => trustedPublicTotals(cards, values), [cards, values]);
  const checklist = leaderboardChecklist({
    signedIn: Boolean(user),
    checksReady: Boolean(user) && cardsReady && !valuesLoading && optReady,
    publicCollection: cards.some((card) => card.isPublic),
    optedIn,
    trustedCards: totals.count,
    value: totals.value,
    accountCreatedAt: accountCreatedAt !== undefined ? accountCreatedAt : (user?.createdAt ?? null),
    boardClosed: Boolean(model.closedMessage),
    username: user?.username ?? "",
    isTest: user?.isTest === true,
    minimums,
  });

  return <ValueBoardView model={model} checklist={checklist} />;
}
