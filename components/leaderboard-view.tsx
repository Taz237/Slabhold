import { getImageProps } from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Crown, Info, Layers, MessageCircle, Plus, TrendingUp } from "lucide-react";
import { LeaderboardCountdown } from "@/components/leaderboard-countdown";
import { LeaderboardFocus } from "@/components/leaderboard-focus";
import { ShareIconButton } from "@/components/share-button";
import type { BoardRow, LeaderboardBoard, LeaderboardPageModel, OpenSpot, YouRow } from "@/lib/leaderboard/present";
import { profileCardsLinkFor, profileLinkFor } from "@/lib/leaderboard/profile-link";
import {
  FINAL_LABEL,
  LEADERBOARD_PATH,
  RULES_SHEET_LABEL,
  YOU_LABEL,
  boardCallToAction,
  scoreUnit,
} from "@/lib/leaderboard/rules";
import { userHref } from "@/lib/social/user-href";

const BOARD_ACCENT: Record<string, string> = {
  "top-card-post": "#7c5cff",
  "rising-collectors": "#10b981",
  "most-cards-added": "#A78BFA",
};

const BOARD_ICON: Record<string, typeof Layers> = {
  "top-card-post": MessageCircle,
  "rising-collectors": TrendingUp,
  "most-cards-added": Layers,
};

const PLACE: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

export const LEADERBOARD_STYLES = `
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

export function PodiumRow({ entry, boardId }: { entry: BoardRow; boardId: string }) {
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

/** #2 left, #1 centre, #3 right. DOM order stays 1, 2, 3 for screen readers. */
const PODIUM_ORDER: Record<number, string> = { 1: "order-2", 2: "order-1", 3: "order-3" };
const PODIUM_AVATAR: Record<number, number> = { 1: 56, 2: 44, 3: 44 };
const PLINTH_HEIGHT: Record<number, string> = { 1: "h-[88px]", 2: "h-[68px]", 3: "h-[56px]" };
const FOCUS_RING =
  "touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";

/**
 * Card-shaped thumbnails of this week's public cards. Drawn on the server with
 * getImageProps, so no client JS. Decorative: the row's link names the person.
 */
function PhotoStrip({
  photos,
  max,
  width,
  height,
  more,
}: {
  photos: readonly string[];
  max: number;
  width: number;
  height: number;
  more: boolean;
}) {
  const shown = photos.slice(0, max);
  if (shown.length === 0) return null;
  const extra = more ? photos.length - shown.length : 0;
  return (
    <span data-photo-strip="" aria-hidden="true" className="mt-1 flex items-center gap-1">
      {shown.map((photo) => (
        <span
          key={photo}
          className="relative block shrink-0 overflow-hidden rounded-[3px] bg-zinc-800 ring-1 ring-white/10"
          style={{ width, height }}
        >
          <Thumb photo={photo} />
        </span>
      ))}
      {extra > 0 ? (
        <span className="grid h-[18px] shrink-0 place-items-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold leading-none tabular-nums text-zinc-200">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

function Thumb({ photo }: { photo: string }) {
  let props: ReturnType<typeof getImageProps>["props"];
  try {
    ({ props } = getImageProps({ src: photo, alt: "", fill: true, sizes: "24px", quality: 75, loading: "lazy" }));
  } catch {
    // A photo next/image will not take keeps the plain placeholder tile.
    return null;
  }
  return (
    // getImageProps is next/image without its client code: this photo is drawn on the server only.
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt="" className="absolute inset-0 h-full w-full object-cover" />
  );
}

function PodiumPlace({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const accent = boardAccent(boardId);
  const labels = person(entry, boardId);
  const rank = entry.rank;
  return (
    <RowShell
      href={profileCardsLinkFor(entry)}
      className="flex min-h-11 min-w-0 flex-col items-center rounded-2xl text-center"
      style={mineRing(entry.mine, accent)}
    >
      <span className={`lb-ring-${rank} shrink-0 rounded-full p-[2px] shadow-[0_2px_10px_rgba(0,0,0,0.35)]`}>
        <span className="block rounded-full bg-zinc-950 p-[2px]">
          <Avatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={PODIUM_AVATAR[rank] ?? 44} />
        </span>
      </span>
      <span className="mt-1.5 block w-full min-w-0 truncate px-1 text-sm font-extrabold tracking-tight text-white">
        {labels.name}
      </span>
      {labels.detail ? (
        <span className="block w-full min-w-0 truncate px-1 text-[11px] text-zinc-400">{labels.detail}</span>
      ) : null}
      {boardId === "most-cards-added" ? (
        <PhotoStrip photos={entry.photos ?? []} max={3} width={22} height={31} more />
      ) : null}
      <span className="mt-1 flex max-w-full items-baseline justify-center gap-1 whitespace-nowrap px-1">
        <span className="shrink-0 text-lg font-black leading-none tabular-nums text-white">{entry.score}</span>
        <span className="min-w-0 truncate text-[11px] font-semibold text-zinc-400">{entry.scoreLabel}</span>
      </span>
      <span
        className={`lb-banner lb-banner-${rank} relative mt-2 flex w-full flex-col items-center justify-start gap-1 overflow-hidden rounded-t-xl pt-2 text-zinc-950 ${
          PLINTH_HEIGHT[rank] ?? "h-[56px]"
        }`}
      >
        {rank === 1 ? (
          <Crown data-crown="" aria-hidden="true" className="h-5 w-5 fill-zinc-950/15" strokeWidth={2.4} />
        ) : null}
        <span className="rounded-sm bg-zinc-950/85 px-1.5 py-[3px] font-mono text-[9px] font-bold leading-none tracking-[0.16em] text-white">
          {PLACE[rank]}
        </span>
        {entry.isNew || entry.mine ? (
          <span className="flex items-center gap-1">
            {entry.isNew ? <Tag tone="dark">NEW</Tag> : null}
            {entry.mine ? <Tag tone="dark">{YOU_LABEL}</Tag> : null}
          </span>
        ) : null}
      </span>
    </RowShell>
  );
}

function GhostPlace({ spot }: { spot: OpenSpot }) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full border-2 border-dashed border-current opacity-60 ${spot.rank === 1 ? "h-[60px] w-[60px]" : "h-12 w-12"}`}
      />
      <span className="mt-1.5 block w-full min-w-0 truncate px-1 text-sm font-bold tracking-tight text-zinc-200">
        {spot.title}
      </span>
      {spot.ctaLabel ? (
        <span className="block w-full min-w-0 truncate px-1 text-[11px] font-semibold text-[#A78BFA]">{spot.ctaLabel}</span>
      ) : null}
      <span
        className={`mt-2 flex w-full flex-col items-center gap-1 rounded-t-xl border-2 border-b-0 border-dashed border-current pt-2 ${
          PLINTH_HEIGHT[spot.rank] ?? "h-[56px]"
        }`}
      >
        {spot.ctaLabel ? (
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.45)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
          </span>
        ) : null}
        <span className="font-mono text-[9px] font-bold leading-none tracking-[0.16em]">{PLACE[spot.rank]}</span>
      </span>
    </>
  );
  const plain: CSSProperties = { background: "transparent" };
  const className = `lb-ghost lb-ghost-${spot.rank} flex min-h-11 min-w-0 flex-col items-center rounded-2xl border-0 bg-transparent text-center`;
  if (!spot.ctaHref)
    return (
      <div className={className} style={plain}>
        {body}
      </div>
    );
  return (
    <Link href={spot.ctaHref} className={`${className} ${FOCUS_RING}`} style={plain}>
      {body}
    </Link>
  );
}

function Podium({ board, delay }: { board: LeaderboardBoard; delay: (index: number) => CSSProperties }) {
  const top = board.entries.filter((entry) => entry.rank <= 3);
  return (
    <ol className="relative grid grid-cols-3 items-end gap-2 pt-1" data-podium="">
      {top.map((entry, index) => (
        <li
          key={entry.id}
          className={`lb-row min-w-0 ${PODIUM_ORDER[entry.rank] ?? ""}`}
          style={delay(index)}
          data-rank={entry.rank}
          data-viewer-row={entry.mine ? "" : undefined}
        >
          <PodiumPlace entry={entry} boardId={board.id} />
        </li>
      ))}
      {board.ghosts.map((spot, index) => (
        <li
          key={`open-${spot.rank}`}
          className={`lb-row min-w-0 ${PODIUM_ORDER[spot.rank] ?? ""}`}
          style={delay(top.length + index)}
          data-ghost-rank={spot.rank}
        >
          <GhostPlace spot={spot} />
        </li>
      ))}
    </ol>
  );
}

function RankRow({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const accent = boardAccent(boardId);
  const labels = person(entry, boardId);
  return (
    <RowShell
      href={profileCardsLinkFor(entry)}
      className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]"
      style={{ ...mineRing(entry.mine, accent), backgroundColor: entry.mine ? `${accent}1f` : undefined }}
    >
      <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums" style={{ color: accent }}>
        {entry.rank}
      </span>
      <Avatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="min-w-0 shrink-0 truncate text-sm font-bold text-white max-w-[65%]">{labels.name}</span>
          {entry.isNew ? <Tag tone="light">NEW</Tag> : null}
          {entry.mine ? <Tag tone="light">{YOU_LABEL}</Tag> : null}
          {labels.detail ? <span className="min-w-0 truncate text-xs text-zinc-500">{labels.detail}</span> : null}
        </span>
        {boardId === "most-cards-added" ? (
          <PhotoStrip photos={entry.photos ?? []} max={4} width={20} height={28} more={false} />
        ) : null}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right">
        <span className="text-base font-black tabular-nums text-white">{entry.score}</span>
        <span className="ml-1 text-[11px] text-zinc-400">{entry.scoreLabel}</span>
      </span>
    </RowShell>
  );
}

/** "You're #3 · 2 cards behind Flaherty", or the board's existing gap or step line. */
function spotLine(you: YouRow, scoreLabel: string, week: "current" | "previous"): string {
  if (you.rank <= 0) return you.gap ? `Not ranked yet · ${you.gap}` : "Not ranked yet";
  if (week === "previous") return `You finished #${you.rank}`;
  const head = `You're #${you.rank}`;
  const rival = you.rival;
  if (!rival) return you.rank === 1 || !you.gap ? head : `${head} · ${you.gap}`;
  if (rival.tied) return `${head} · tied with ${rival.name}`;
  const amount = `${rival.need} ${scoreUnit(scoreLabel, rival.need)}`;
  return you.rank === 1 ? `${head} · ${amount} ahead of ${rival.name}` : `${head} · ${amount} behind ${rival.name}`;
}

const ACTION_CLASS = `inline-flex min-h-11 max-w-[9.5rem] shrink-0 items-center justify-center rounded-full bg-violet-600 px-3.5 py-1 text-center text-sm font-bold leading-4 text-white hover:bg-violet-500 ${FOCUS_RING}`;

function SpotAction({ you, boardId }: { you: YouRow; boardId: string }) {
  const cta = boardCallToAction(boardId, "current");
  if (boardId === "most-cards-added") {
    return (
      <Link href={cta.href} className={ACTION_CLASS}>
        Add card
      </Link>
    );
  }
  if (boardId === "rising-collectors") {
    const handle = you.subtitle.trim().replace(/^@/, "");
    if (you.rank > 0 && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(handle)) {
      return (
        <span className="shrink-0 [&>button]:border-0 [&>button]:bg-violet-600 [&>button]:text-white [&>button]:hover:bg-violet-500">
          <ShareIconButton path={userHref(handle)} title="My Slabhold profile" label="Share profile" />
        </span>
      );
    }
  }
  return (
    <Link href={cta.href} className={ACTION_CLASS}>
      {boardId === "rising-collectors" ? "Find collectors" : cta.label}
    </Link>
  );
}

/**
 * The viewer's spot, pinned just above the bottom tab bar while this board is
 * on screen. CSS sticky only: the next board's bar takes over as it scrolls in.
 */
function PinnedSpot({ you, board, week }: { you: YouRow; board: LeaderboardBoard; week: "current" | "previous" }) {
  if (week === "previous" && you.rank <= 0) return null;
  const accent = boardAccent(board.id);
  return (
    <div
      data-your-spot=""
      className="sticky z-10 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-3 flex min-h-14 items-center gap-2.5 rounded-2xl bg-zinc-900/95 px-3 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur"
    >
      {you.rank > 0 ? (
        <Avatar
          title={board.id === "top-card-post" ? you.subtitle.replace(/^@/, "") || you.title : you.title}
          accent={you.accent || accent}
          url={you.avatarUrl}
          size={28}
        />
      ) : (
        <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full border-2 border-dashed border-white/25" />
      )}
      <span className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-4 text-white">
        {spotLine(you, board.scoreLabel, week)}
      </span>
      <span className="sr-only">{you.label}</span>
      {week === "current" ? <SpotAction you={you} boardId={board.id} /> : null}
    </div>
  );
}

function Board({ board, week }: { board: LeaderboardBoard; week: "current" | "previous" }) {
  const accent = boardAccent(board.id);
  const Icon = BOARD_ICON[board.id] ?? Layers;
  const delay = (index: number): CSSProperties => ({ animationDelay: `${index * 45}ms` });
  const rest = board.entries.filter((entry) => entry.rank > 3);
  return (
    <section
      id={`board-${board.id}`}
      data-board={board.id}
      data-board-focus={board.focused ? "" : undefined}
      aria-labelledby={`board-${board.id}-title`}
      className="relative scroll-mt-20 overflow-clip rounded-3xl border border-white/10 bg-zinc-950 px-3 pb-3"
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
      <Podium board={board} delay={delay} />
      <div data-board-rest="" className="relative">
        {rest.length > 0 ? (
          <ol className="relative mt-3 space-y-1" data-rank-rows="">
            {rest.map((entry, index) => (
              <li
                key={entry.id}
                className="lb-row"
                style={delay(3 + index)}
                data-rank={entry.rank}
                data-viewer-row={entry.mine ? "" : undefined}
              >
                <RankRow entry={entry} boardId={board.id} />
              </li>
            ))}
          </ol>
        ) : null}
        {board.you ? <PinnedSpot you={board.you} board={board} week={week} /> : null}
      </div>
    </section>
  );
}

export function LeaderboardView({ model }: { model: LeaderboardPageModel }) {
  const closed = model.standing === FINAL_LABEL;
  return (
    <div className="-mx-4 -mt-5 bg-zinc-950 text-zinc-100" data-leaderboard="">
      <style>{LEADERBOARD_STYLES}</style>
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
            <Board key={board.id} board={board} week={model.week} />
          ))}
        </div>
      )}
      {model.focusBoardId ? <LeaderboardFocus boardId={model.focusBoardId} /> : null}
    </div>
  );
}
