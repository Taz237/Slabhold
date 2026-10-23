import Link from "next/link";
import { Crown, Trophy } from "lucide-react";
import { LeaderboardChips } from "@/components/leaderboard-chips";
import { LeaderboardCountdown } from "@/components/leaderboard-countdown";
import { ShareIconButton } from "@/components/share-button";
import type { LeaderboardPageModel, RankedEntry, YouRow } from "@/lib/leaderboard/present";
import { boardCallToAction, LEADERBOARD_PATH } from "@/lib/leaderboard/rules";

const MEDAL: Record<number, { ring: string; glow: string }> = {
  1: { ring: "#f6d36b", glow: "rgba(246,211,107,0.55)" },
  2: { ring: "#d5dde6", glow: "rgba(213,221,230,0.45)" },
  3: { ring: "#e0a36a", glow: "rgba(224,163,106,0.45)" },
};

function Avatar({
  title,
  accent,
  url,
  size,
}: {
  title: string;
  accent: string;
  url: string | null;
  size: number;
}) {
  const letter = title.trim().slice(0, 1).toUpperCase() || "?";
  const photo = url?.trim() ?? "";
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-cover bg-center font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: accent || "#7c5cff",
        backgroundImage: photo ? `url("${photo.replace(/["\\\n\r]/g, "")}")` : undefined,
        fontSize: size > 64 ? 28 : 14,
      }}
    >
      {photo ? "" : letter}
    </span>
  );
}

function NewTag() {
  return (
    <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
      NEW
    </span>
  );
}

function personLabels(entry: RankedEntry, boardId: string): { name: string; detail: string } {
  if (boardId === "top-card-post" && entry.subtitle) {
    return { name: entry.subtitle, detail: entry.title };
  }
  return { name: entry.title, detail: entry.subtitle };
}

function PodiumSpot({ entry, boardId }: { entry: RankedEntry; boardId: string }) {
  const labels = personLabels(entry, boardId);
  const medal = MEDAL[entry.rank] ?? MEDAL[3];
  const first = entry.rank === 1;
  const size = first ? 84 : 64;
  return (
    <Link
      href={entry.href}
      data-podium-spot={entry.rank}
      className={`lb-podium flex min-w-0 flex-col items-center px-1 text-center ${
        first ? "lb-podium-1" : entry.rank === 2 ? "lb-podium-2" : "lb-podium-3"
      }`}
    >
      {first ? (
        <Crown className="mb-1 h-6 w-6 text-[#f6d36b]" aria-hidden="true" />
      ) : (
        <span className="mb-1 h-6" aria-hidden="true" />
      )}
      <span
        className={`rounded-full p-[3px] ${first ? "lb-shimmer" : ""}`}
        style={{ background: medal.ring, boxShadow: `0 0 22px ${medal.glow}` }}
      >
        <span className="block rounded-full bg-zinc-950 p-[2px]">
          <Avatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={size} />
        </span>
      </span>
      <span
        className={`mt-2 max-w-full font-black leading-tight text-white ${
          first ? "line-clamp-2 text-base" : "truncate text-xs"
        }`}
      >
        {labels.name}
      </span>
      {labels.detail ? (
        <span className="max-w-full truncate text-[11px] text-zinc-400">{labels.detail}</span>
      ) : null}
      <span className={`mt-1 font-black tabular-nums text-white ${first ? "text-3xl" : "text-xl"}`}>
        {entry.score}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{entry.scoreLabel}</span>
      {entry.isNew ? (
        <span className="mt-1">
          <NewTag />
        </span>
      ) : null}
    </Link>
  );
}

function Podium({ entries, boardId }: { entries: readonly RankedEntry[]; boardId: string }) {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));
  const spots = [byRank.get(2), byRank.get(1), byRank.get(3)].filter((entry): entry is RankedEntry => Boolean(entry));
  if (spots.length === 0) return null;
  return (
    <div
      data-podium=""
      className="grid grid-cols-3 items-end gap-1 px-2 pt-4 pb-2"
    >
      {spots.map((entry) => (
        <PodiumSpot key={entry.id} entry={entry} boardId={boardId} />
      ))}
    </div>
  );
}

function YouCard({ you }: { you: YouRow }) {
  return (
    <div className="rounded-2xl border border-violet-400/40 bg-zinc-950 px-4 py-3 shadow-[0_10px_30px_rgba(124,92,255,0.28)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-200">Your rank</p>
          <p className="text-lg font-black text-white">
            {you.rank > 0 ? `#${you.rank}` : you.score > 0 ? `${you.score} ${you.scoreLabel}` : "Not ranked"}
          </p>
        </div>
        {you.rank > 0 ? (
          <p className="text-right text-lg font-black tabular-nums text-white">
            {you.score} <span className="text-xs font-semibold text-zinc-400">{you.scoreLabel}</span>
          </p>
        ) : null}
      </div>
      {you.gap ? <p className="mt-1 text-sm text-zinc-200">{you.gap}</p> : null}
      {you.ctaHref && you.ctaLabel ? (
        <Link
          href={you.ctaHref}
          className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#7c5cff] px-4 text-sm font-bold text-white"
        >
          {you.ctaLabel}
        </Link>
      ) : null}
      <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
        {you.label}
      </span>
    </div>
  );
}

export function LeaderboardView({ model }: { model: LeaderboardPageModel }) {
  const cta = boardCallToAction(model.boardId, model.week);
  const podium = model.entries.filter((entry) => entry.rank <= 3);
  const rest = model.entries.filter((entry) => entry.rank > 3);
  return (
    <div
      className={`-mx-4 -mt-5 bg-zinc-950 text-zinc-100${
        model.you
          ? " -mb-[calc(7rem+env(safe-area-inset-bottom))] pb-[calc(7rem+env(safe-area-inset-bottom))] md:-mb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-[calc(10rem+env(safe-area-inset-bottom))]"
          : ""
      }`}
      data-leaderboard=""
      data-board-accent={model.boardId}
    >
      <style>{`
        @keyframes lb-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes lb-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .lb-podium { animation: lb-rise .5s ease both; }
        .lb-podium-2 { animation-delay: .04s; }
        .lb-podium-1 { animation-delay: .12s; }
        .lb-podium-3 { animation-delay: .2s; }
        .lb-shimmer {
          background-image: linear-gradient(110deg, #f6d36b 0%, #fff6d0 42%, #f6d36b 78%);
          background-size: 200% 100%;
          animation: lb-shimmer 2.8s linear infinite;
        }
        .lb-chip-spin { animation: lb-spin .7s linear infinite; }
        @keyframes lb-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .lb-podium, .lb-shimmer, .lb-chip-spin { animation: none; }
        }
        [data-board-body] { transition: opacity 150ms ease; }
        [data-leaderboard][data-board-pending] [data-board-body] { opacity: 0.6; }
      `}</style>
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-white">{model.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">{model.description}</p>
          </div>
          <ShareIconButton path={LEADERBOARD_PATH} title={model.title} label="Share" />
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          <span className="whitespace-nowrap font-medium text-zinc-100">{model.weekLabel}</span>
          {" "}
          <span className="whitespace-nowrap">
            {"·\u00A0"}
            <span data-standing="">{model.standing}</span>
          </span>
          {model.showCountdown ? (
            <>
              {" "}
              <span className="whitespace-nowrap">
                {"·\u00A0"}
                <LeaderboardCountdown resetsAt={model.resetsAt} initialLabel={model.countdownLabel} />
              </span>
            </>
          ) : null}
        </p>
        {model.standingNote ? (
          <p className="mt-1 text-sm text-zinc-500" data-closed-note="">
            {model.standingNote}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 border-b border-white/10 text-[15px]">
        {model.weekLinks.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center px-3 text-center font-semibold ${
              link.active ? "text-white" : "text-zinc-500"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <LeaderboardChips tabs={model.tabs} />

      <div data-board-body="">
      {model.status === "error" ? (
        <div className="px-6 py-12 text-center" data-board-error="">
          <p className="text-[17px] font-bold tracking-tight text-white">{model.errorTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-400">{model.errorDetail}</p>
        </div>
      ) : model.thin ? (
        <div className="px-6 py-12 text-center" data-thin-board="">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#7c5cff]/20 text-[#c4b5fd]">
            <Trophy className="h-6 w-6" />
          </div>
          <p className="text-[17px] font-bold tracking-tight text-white">{model.thinTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-400">{model.thinDetail}</p>
          <Link
            href={cta.href}
            data-empty-cta=""
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#7c5cff] px-5 text-sm font-bold text-white shadow-[0_0_18px_rgba(124,92,255,0.45)]"
          >
            {cta.label}
          </Link>
        </div>
      ) : (
        <div>
          <Podium entries={podium} boardId={model.boardId} />
          {rest.length > 0 ? (
            <ol className="mt-2 divide-y divide-white/10" data-rank-rows="">
              {rest.map((entry) => (
                <li key={entry.id}>
                  <Link href={entry.href} className="flex min-h-11 items-center gap-3 px-4 py-3">
                    <span className="w-6 shrink-0 text-sm font-bold tabular-nums text-zinc-500">{entry.rank}</span>
                    <Avatar title={personLabels(entry, model.boardId).name} accent={entry.accent} url={entry.avatarUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-white">
                          {personLabels(entry, model.boardId).name}
                        </span>
                        {entry.isNew ? <NewTag /> : null}
                      </span>
                      {personLabels(entry, model.boardId).detail ? (
                        <span className="block truncate text-xs text-zinc-500">
                          {personLabels(entry, model.boardId).detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-white">{entry.score}</span>
                      <span className="block text-[11px] text-zinc-500">{entry.scoreLabel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
      </div>

      <section className="border-t border-white/10 px-4 py-6" data-how-to="">
        <h2 className="text-sm font-bold text-white">How to get on the leaderboard</h2>
        <div className="mt-4 space-y-5">
          {model.howTo.map((board) => (
            <div key={board.id}>
              <h3 className="text-sm font-semibold text-white">{board.label}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-zinc-300">
                {board.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 px-4 py-6" data-checklist="">
        <h2 className="text-sm font-bold text-white">Your checklist</h2>
        <ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-300">
          {model.checklist.map((item) => (
            <li key={item.id}>
              <span className="font-semibold text-white">{item.label}. </span>
              {item.line}
            </li>
          ))}
        </ul>
      </section>

      {model.you ? (
        <>
          <div className="invisible px-3 py-2" aria-hidden="true" inert data-you-spacer="">
            <YouCard you={model.you} />
          </div>
          <div
            className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-lg bg-zinc-950 px-3 py-2"
            data-you-row=""
          >
            <YouCard you={model.you} />
          </div>
        </>
      ) : null}
    </div>
  );
}
