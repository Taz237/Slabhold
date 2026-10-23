import Link from "next/link";
import { Trophy } from "lucide-react";
import { LeaderboardCountdown } from "@/components/leaderboard-countdown";
import { ShareIconButton } from "@/components/share-button";
import type { LeaderboardPageModel } from "@/lib/leaderboard/present";
import { LEADERBOARD_PATH } from "@/lib/leaderboard/rules";

function Mark({ title, accent }: { title: string; accent: string }) {
  const letter = title.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
      style={{ background: accent || "#7c5cff" }}
    >
      {letter}
    </span>
  );
}

export function LeaderboardView({ model }: { model: LeaderboardPageModel }) {
  return (
    <div className="-mx-4 -mt-5" data-leaderboard="">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{model.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{model.description}</p>
          </div>
          <ShareIconButton path={LEADERBOARD_PATH} title={model.title} label="Share" />
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">{model.weekLabel}</span>
          {" · "}
          <span data-standing="">{model.standing}</span>
          {model.showCountdown ? (
            <>
              {" · "}
              <LeaderboardCountdown resetsAt={model.resetsAt} initialLabel={model.countdownLabel} />
            </>
          ) : null}
        </p>
        {model.standingNote ? (
          <p className="mt-1 text-sm text-zinc-500" data-closed-note="">
            {model.standingNote}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 border-b border-zinc-200 text-[15px] dark:border-white/10">
        {model.weekLinks.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center px-3 text-center font-semibold ${
              link.active ? "text-zinc-900 dark:text-white" : "text-zinc-500"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div
        className="flex gap-2 overflow-x-auto border-b border-zinc-200 px-4 py-3 dark:border-white/10"
        data-board-tabs=""
      >
        {model.tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            data-board={tab.id}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
              tab.active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {model.status === "error" ? (
        <div className="px-6 py-12 text-center" data-board-error="">
          <p className="text-[17px] font-bold tracking-tight">{model.errorTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-500">{model.errorDetail}</p>
        </div>
      ) : model.thin ? (
        <div className="px-6 py-12 text-center" data-thin-board="">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10">
            <Trophy className="h-5 w-5" />
          </div>
          <p className="text-[17px] font-bold tracking-tight">{model.thinTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-500">{model.thinDetail}</p>
        </div>
      ) : (
        <ol className="divide-y divide-zinc-200 dark:divide-white/10">
          {model.entries.map((entry) => (
            <li key={entry.id}>
              <Link href={entry.href} className="flex min-h-11 items-center gap-3 px-4 py-3">
                <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-zinc-500">#{entry.rank}</span>
                <Mark title={entry.title} accent={entry.accent} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{entry.title}</span>
                  {entry.subtitle ? (
                    <span className="block truncate text-xs text-zinc-500">{entry.subtitle}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums">{entry.score}</span>
                  <span className="block text-[11px] text-zinc-500">{entry.scoreLabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {model.you ? (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 px-4 py-2" data-you-row="">
          <Link
            href={model.you.href}
            className="flex items-center justify-between gap-3 rounded-2xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm shadow-sm dark:border-violet-400/30 dark:bg-violet-500/15"
          >
            <span className="font-bold">{model.you.label}</span>
            <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
              {model.you.title}
              {model.you.subtitle ? ` · ${model.you.subtitle}` : ""}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{model.you.score}</span>
          </Link>
        </div>
      ) : null}

      <section className="border-t border-zinc-200 px-4 py-6 dark:border-white/10" data-how-to="">
        <h2 className="text-sm font-bold">How to get on the leaderboard</h2>
        <div className="mt-4 space-y-5">
          {model.howTo.map((board) => (
            <div key={board.id}>
              <h3 className="text-sm font-semibold">{board.label}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                {board.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 px-4 py-6 dark:border-white/10" data-checklist="">
        <h2 className="text-sm font-bold">Your checklist</h2>
        <ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
          {model.checklist.map((item) => (
            <li key={item.id}>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{item.label}. </span>
              {item.line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
