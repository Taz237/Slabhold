import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Crown, Info, Layers, MessageCircle, Plus, TrendingUp } from "lucide-react";
import { LeaderboardCountdown } from "@/components/leaderboard-countdown";
import { LeaderboardFocus } from "@/components/leaderboard-focus";
import { ShareIconButton } from "@/components/share-button";
import type { BoardRow, LeaderboardBoard, LeaderboardPageModel, OpenSpot, YouRow } from "@/lib/leaderboard/present";
import { profileLinkFor } from "@/lib/leaderboard/profile-link";
import { FINAL_LABEL, LEADERBOARD_PATH, RULES_SHEET_LABEL, YOU_LABEL, YOUR_SPOT_LABEL } from "@/lib/leaderboard/rules";

const BOARD_ACCENT: Record<string, string> = {
  "top-card-post": "#7c5cff",
  "rising-collectors": "#10b981",
  "most-cards-added": "#14b8a6",
};

const BOARD_ICON: Record<string, typeof Layers> = {
  "top-card-post": MessageCircle,
  "rising-collectors": TrendingUp,
  "most-cards-added": Layers,
};

const PLACE: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

const STYLES = `
  @keyframes lb-rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lb-sweep {
    0% { background-position: 160% 0; }
    55%, 100% { background-position: -60% 0; }
  }
  @keyframes lb-focus {
    0%, 35% { box-shadow: 0 0 0 2px var(--lb-accent), 0 0 36px -4px var(--lb-accent); }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  .lb-row { animation: lb-rise .42s cubic-bezier(.2,.7,.2,1) both; }
  [data-board-focus] { animation: lb-focus 2.2s ease-out .35s both; }
  .lb-banner-1 { background: linear-gradient(135deg, #FFE27A 0%, #F5B700 38%, #FFF3B0 68%, #D99A00 100%); }
  .lb-banner-2 { background: linear-gradient(135deg, #F7F9FB 0%, #C3CBD4 52%, #EEF1F5 100%); }
  .lb-banner-3 { background: linear-gradient(135deg, #F6BC8A 0%, #C46A2B 52%, #F3CBA6 100%); }
  .lb-banner-1::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.65) 50%, transparent 65%) no-repeat;
    background-size: 250% 100%;
    animation: lb-sweep 4.2s ease-in-out 1s infinite;
  }
  .lb-ring-1 { background: linear-gradient(135deg, #FFF3B0, #D99A00); }
  .lb-ring-2 { background: linear-gradient(135deg, #FFFFFF, #8D97A3); }
  .lb-ring-3 { background: linear-gradient(135deg, #F6BC8A, #8A4314); }
  .lb-ghost-1 { border-color: #F5B700; background: rgba(245,183,0,.06); color: #F5B700; }
  .lb-ghost-2 { border-color: #C3CBD4; background: rgba(195,203,212,.05); color: #C3CBD4; }
  .lb-ghost-3 { border-color: #C46A2B; background: rgba(196,106,43,.07); color: #E09A66; }
  [data-rules] summary::-webkit-details-marker { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .lb-row, .lb-banner-1::after { animation: none; }
    [data-board-focus] { animation: none; box-shadow: 0 0 0 2px var(--lb-accent); }
  }
`;

function boardAccent(boardId: string): string {
  return BOARD_ACCENT[boardId] ?? "#7c5cff";
}

function Avatar({ title, accent, url, size }: { title: string; accent: string; url: string | null; size: number }) {
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
        fontSize: size > 64 ? 28 : 15,
      }}
    >
      {photo ? "" : letter}
    </span>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone: "dark" | "light" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase leading-none tracking-wider ${
        tone === "dark" ? "bg-zinc-950/85 text-white" : "bg-white/15 text-white"
      }`}
    >
      {children}
    </span>
  );
}

function person(entry: BoardRow, boardId: string): { name: string; detail: string } {
  const handle = entry.subtitle.trim().startsWith("@") ? entry.subtitle.trim() : "";
  const stripped = handle.replace(/^@/, "");
  if (boardId === "top-card-post") {
    const card = entry.title.trim();
    return { name: stripped || card, detail: [handle, stripped ? card : ""].filter(Boolean).join(" · ") };
  }
  return { name: entry.title.trim() || stripped, detail: handle };
}

/** A profile link, or a plain block when the handle can't make a clean `/u/` path. */
function RowShell({
  href,
  className,
  style,
  children,
}: {
  href: string | null;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const shared = `${className} touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400`;
  if (!href) {
    return (
      <div className={shared} style={style}>
        {children}
      </div>
    );
  }
  return (
    <Link href={href} className={shared} style={style}>
      {children}
    </Link>
  );
}

function mineRing(mine: boolean, accent: string): CSSProperties | undefined {
  return mine ? { boxShadow: `0 0 0 2px #09090b, 0 0 0 4px ${accent}` } : undefined;
}

function PodiumRow({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const accent = boardAccent(boardId);
  const labels = person(entry, boardId);
  return (
    <RowShell
      href={profileLinkFor(entry)}
      className={`lb-banner lb-banner-${entry.rank} relative flex min-h-[72px] min-w-0 items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-zinc-950`}
      style={mineRing(entry.mine, accent)}
    >
      <span className="grid w-6 shrink-0 place-items-center">
        {entry.rank === 1 ? (
          <Crown data-crown="" aria-hidden="true" className="h-6 w-6 fill-zinc-950/15" strokeWidth={2.4} />
        ) : (
          <span className="text-lg font-black tabular-nums">{entry.rank}</span>
        )}
      </span>
      <span className={`lb-ring-${entry.rank} shrink-0 rounded-full p-[2px] shadow-[0_2px_10px_rgba(0,0,0,0.25)]`}>
        <span className="block rounded-full bg-zinc-950 p-[2px]">
          <Avatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={40} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 inline-block rounded-sm bg-zinc-950/85 px-1.5 py-[3px] font-mono text-[9px] font-bold leading-none tracking-[0.16em] text-white">
          {PLACE[entry.rank]}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-extrabold tracking-tight">{labels.name}</span>
          {entry.isNew ? <Tag tone="dark">NEW</Tag> : null}
          {entry.mine ? <Tag tone="dark">{YOU_LABEL}</Tag> : null}
        </span>
        {labels.detail ? <span className="block truncate text-xs font-medium text-zinc-950/65">{labels.detail}</span> : null}
      </span>
      <span className="relative shrink-0 text-right">
        <span className="block text-2xl font-black leading-none tabular-nums">{entry.score}</span>
        <span className="mt-0.5 block text-[11px] font-semibold text-zinc-950/70">{entry.scoreLabel}</span>
      </span>
    </RowShell>
  );
}

function RankRow({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const accent = boardAccent(boardId);
  const labels = person(entry, boardId);
  return (
    <RowShell
      href={profileLinkFor(entry)}
      className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
      style={{ ...mineRing(entry.mine, accent), backgroundColor: entry.mine ? `${accent}1f` : undefined }}
    >
      <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums" style={{ color: accent }}>
        {entry.rank}
      </span>
      <Avatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-bold text-white">{labels.name}</span>
          {entry.isNew ? <Tag tone="light">NEW</Tag> : null}
          {entry.mine ? <Tag tone="light">{YOU_LABEL}</Tag> : null}
        </span>
        {labels.detail ? <span className="block truncate text-xs text-zinc-400">{labels.detail}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-lg font-black leading-none tabular-nums text-white">{entry.score}</span>
        <span className="mt-0.5 block text-[11px] text-zinc-400">{entry.scoreLabel}</span>
      </span>
    </RowShell>
  );
}

function GhostRow({ spot }: { spot: OpenSpot }) {
  const body = (
    <>
      <span className="w-6 shrink-0 text-center text-lg font-black tabular-nums opacity-70">{spot.rank}</span>
      <span aria-hidden="true" className="h-11 w-11 shrink-0 rounded-full border-2 border-dashed border-current opacity-60" />
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 inline-block font-mono text-[9px] font-bold leading-none tracking-[0.16em]">
          {PLACE[spot.rank]}
        </span>
        <span className="block truncate text-[15px] font-bold tracking-tight text-zinc-200">{spot.title}</span>
        {spot.ctaLabel ? (
          <span className="block truncate text-xs font-semibold text-[#A78BFA]">{spot.ctaLabel}</span>
        ) : null}
      </span>
      {spot.ctaLabel ? (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.45)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
        </span>
      ) : null}
    </>
  );
  const className = `lb-ghost lb-ghost-${spot.rank} flex min-h-[72px] min-w-0 items-center gap-3 rounded-2xl border-2 border-dashed px-3 py-2.5`;
  if (!spot.ctaHref) return <div className={className}>{body}</div>;
  return (
    <Link
      href={spot.ctaHref}
      className={`${className} touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400`}
    >
      {body}
    </Link>
  );
}

function YourSpot({ you, accent }: { you: YouRow; accent: string }) {
  const ranked = you.rank > 0;
  return (
    <div
      data-your-spot=""
      className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-dashed px-3 py-2"
      style={{ borderColor: `${accent}66`, backgroundColor: `${accent}12` }}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
          {YOUR_SPOT_LABEL}
        </span>
        <span className="block truncate text-sm text-zinc-300">
          {ranked ? (
            <>
              <span className="font-black tabular-nums text-white">#{you.rank}</span>
              {you.gap ? ` · ${you.gap}` : ""}
            </>
          ) : you.ctaLabel ? (
            "Not ranked yet"
          ) : (
            you.gap || "Not ranked"
          )}
        </span>
      </span>
      {ranked ? (
        <span className="shrink-0 text-right text-sm font-bold tabular-nums text-white">
          {you.score} <span className="text-[11px] font-normal text-zinc-400">{you.scoreLabel}</span>
        </span>
      ) : you.ctaHref && you.ctaLabel ? (
        <Link
          href={you.ctaHref}
          className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-full bg-violet-600 px-4 text-sm font-bold text-white"
        >
          {you.ctaLabel}
        </Link>
      ) : null}
      <span className="sr-only">{you.label}</span>
    </div>
  );
}

function Board({ board }: { board: LeaderboardBoard }) {
  const accent = boardAccent(board.id);
  const Icon = BOARD_ICON[board.id] ?? Layers;
  const delay = (index: number) => ({ animationDelay: `${index * 45}ms` });
  return (
    <section
      id={`board-${board.id}`}
      data-board={board.id}
      data-board-focus={board.focused ? "" : undefined}
      aria-labelledby={`board-${board.id}-title`}
      className="relative scroll-mt-20 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 px-3 pb-3"
      style={{ "--lb-accent": accent } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}38 0%, transparent 70%)` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <header className="relative flex items-start gap-3 px-1 pt-4 pb-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`board-${board.id}-title`} className="text-[17px] font-bold leading-tight tracking-tight text-white">
            {board.label}
          </h2>
          <p className="mt-0.5 text-sm leading-5 text-zinc-400">
            {board.leadTitle ? <span className="font-semibold text-white">{board.leadTitle}. </span> : null}
            {board.lead}
          </p>
        </div>
      </header>
      <ol className="relative space-y-2" data-rank-rows="">
        {board.entries.map((entry, index) => (
          <li
            key={entry.id}
            className="lb-row"
            style={delay(index)}
            data-rank={entry.rank}
            data-viewer-row={entry.mine ? "" : undefined}
          >
            {entry.rank <= 3 ? <PodiumRow entry={entry} boardId={board.id} /> : <RankRow entry={entry} boardId={board.id} />}
          </li>
        ))}
        {board.ghosts.map((spot, index) => (
          <li key={`open-${spot.rank}`} className="lb-row" style={delay(board.entries.length + index)} data-ghost-rank={spot.rank}>
            <GhostRow spot={spot} />
          </li>
        ))}
      </ol>
      {board.yourSpot ? <YourSpot you={board.yourSpot} accent={accent} /> : null}
    </section>
  );
}

export function LeaderboardView({ model }: { model: LeaderboardPageModel }) {
  const closed = model.standing === FINAL_LABEL;
  return (
    <div className="-mx-4 -mt-5 bg-zinc-950 text-zinc-100" data-leaderboard="">
      <style>{STYLES}</style>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-white">{model.title}</h1>
            <p className="mt-0.5 text-sm text-zinc-400">{model.description}</p>
          </div>
          <ShareIconButton path={LEADERBOARD_PATH} title={model.title} label="Share" />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
          <span className="whitespace-nowrap font-medium text-zinc-100">{model.weekLabel}</span>
          <span
            data-standing=""
            className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.12em] ${
              closed ? "bg-white/10 text-zinc-300" : "bg-violet-500/20 text-[#A78BFA]"
            }`}
          >
            {model.standing}
          </span>
          {model.showCountdown ? (
            <LeaderboardCountdown resetsAt={model.resetsAt} initialLabel={model.countdownLabel} />
          ) : null}
        </p>
        {model.standingNote ? (
          <p className="mt-1 text-xs text-zinc-500" data-closed-note="">
            {model.standingNote}
          </p>
        ) : null}
      </div>

      <div className="mx-4 grid grid-cols-2 rounded-full bg-white/[0.06] p-1 text-sm">
        {model.weekLinks.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-3 text-center font-semibold ${
              link.active ? "bg-white text-zinc-950" : "text-zinc-400"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="relative mx-4 mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-zinc-500">{model.rulesLine}</p>
        <details data-rules="" className="group">
          <summary
            aria-label={RULES_SHEET_LABEL}
            className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full text-zinc-400 hover:text-white group-open:text-white"
          >
            <Info aria-hidden="true" className="h-[18px] w-[18px]" />
          </summary>
          <div className="absolute inset-x-0 top-full z-20 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#18181B] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
            <p className="text-sm font-bold text-white">{RULES_SHEET_LABEL}</p>
            <div className="mt-3 space-y-4">
              {model.rules.map((board) => (
                <div key={board.id}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: boardAccent(board.id) }}>
                    {board.label}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-5 text-zinc-300">
                    {board.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>

      {model.status === "error" ? (
        <div className="mx-3 mt-3 mb-8 rounded-3xl border border-white/10 px-6 py-12 text-center" data-board-error="">
          <p className="text-[17px] font-bold tracking-tight text-white">{model.errorTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-400">{model.errorDetail}</p>
        </div>
      ) : (
        <div className="space-y-4 px-3 pt-2 pb-8">
          {model.boards.map((board) => (
            <Board key={board.id} board={board} />
          ))}
        </div>
      )}
      {model.focusBoardId ? <LeaderboardFocus boardId={model.focusBoardId} /> : null}
    </div>
  );
}
