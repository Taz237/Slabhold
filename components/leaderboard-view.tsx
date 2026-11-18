import { getImageProps } from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronUp, Crown, Info, Minus, Plus } from "lucide-react";
import { LeaderboardAvatar } from "@/components/leaderboard-avatar";
import { LeaderboardCount } from "@/components/leaderboard-count";
import { LeaderboardCountdown } from "@/components/leaderboard-countdown";
import { LeaderboardFocus } from "@/components/leaderboard-focus";
import { LeaderboardRetry } from "@/components/leaderboard-retry";
import { ShareRankButton, type RankShare } from "@/components/leaderboard-share-rank";
import type { SheetPerson } from "@/components/leaderboard-sheet";
import { LeaderboardStage } from "@/components/leaderboard-stage";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ShareIconButton } from "@/components/share-button";
import { TeamBadge } from "@/components/team-badge";
import {
  moveLabel,
  ordinal,
  rankShareLink,
  rankSharePath,
  rankShareText,
  spotHook,
} from "@/lib/leaderboard/hooks";
import type {
  BoardRow,
  LastWeekRow,
  LeaderboardBoard,
  LeaderboardPageModel,
  OpenSpot,
  OpenSpotsRow,
  RankMove,
  YouRow,
} from "@/lib/leaderboard/present";
import { profileCardsLinkFor, profileLinkFor } from "@/lib/leaderboard/profile-link";
import {
  FINAL_LABEL,
  LAST_WEEK_LABEL,
  LEADERBOARD_PATH,
  RULES_SHEET_LABEL,
  YOU_LABEL,
  boardCallToAction,
  leaderboardHref,
} from "@/lib/leaderboard/rules";
import {
  LB_CARD_BOTTOM,
  LB_CARD_TOP,
  LB_PAGE_BOTTOM,
  LB_PAGE_MID,
  LB_PAGE_TOP,
  LB_RANK_TEXT,
  LB_YOU,
  LB_YOU_TINT,
  LB_YOU_TINT_ALPHA,
} from "@/lib/leaderboard/theme";
import { userHref } from "@/lib/social/user-href";

const BOARD_ACCENT: Record<string, string> = {
  "top-card-post": "#7c5cff",
  "rising-collectors": "#7c3aed",
  "most-cards-added": "#A78BFA",
};

/** `LB_YOU_TINT` at `LB_YOU_TINT_ALPHA`, as an 8-digit hex. */
const YOU_TINT = `${LB_YOU_TINT}${Math.round(LB_YOU_TINT_ALPHA * 255)
  .toString(16)
  .padStart(2, "0")}`;

export const LEADERBOARD_STYLES = `
  @keyframes lb-rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lb-block {
    from { transform: scaleY(.35); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  @keyframes lb-sweep {
    from { background-position: 160% 0; }
    to { background-position: -60% 0; }
  }
  @keyframes lb-panel {
    from { opacity: 0; transform: translateX(var(--lb-from, 16px)); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lb-sheet {
    from { transform: translateY(100%); }
    to { transform: none; }
  }
  @keyframes lb-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  [data-leaderboard] {
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(124,58,237,.42), transparent 62%),
      linear-gradient(180deg, ${LB_PAGE_TOP} 0%, ${LB_PAGE_MID} 44%, ${LB_PAGE_BOTTOM} 100%);
    /* The page's own bottom padding, under the tab bar, stays the same night purple. A shadow adds no scroll. */
    box-shadow: 0 16rem 0 0 ${LB_PAGE_BOTTOM};
  }
  /* Wider than the column: the night fills the window, and the lit column fades into it at both sides. */
  @media (min-width: 640px) {
    [data-leaderboard] {
      background:
        linear-gradient(90deg, ${LB_PAGE_BOTTOM} 0%, transparent 14%, transparent 86%, ${LB_PAGE_BOTTOM} 100%),
        radial-gradient(120% 60% at 50% 0%, rgba(124,58,237,.42), transparent 62%),
        linear-gradient(180deg, ${LB_PAGE_TOP} 0%, ${LB_PAGE_MID} 44%, ${LB_PAGE_BOTTOM} 100%);
      box-shadow: 0 0 0 100vmax ${LB_PAGE_BOTTOM};
      clip-path: inset(0 -100vmax -100vmax -100vmax);
    }
  }
  [data-dir="prev"] { --lb-from: -16px; }
  .lb-panel {
    background: linear-gradient(180deg, ${LB_CARD_TOP} 0%, ${LB_CARD_BOTTOM} 100%);
    animation: lb-panel .26s cubic-bezier(.2,.7,.2,1) both;
  }
  /* The arena behind the podium: one soft light on 1st, and a fine floor grid that fades out. */
  .lb-arena {
    background:
      radial-gradient(58% 46% at 50% 30%, rgba(167,139,250,.34), transparent 72%),
      radial-gradient(90% 60% at 50% 0%, color-mix(in srgb, var(--lb-accent, #7c3aed) 32%, transparent), transparent 70%);
  }
  .lb-arena::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,.10) 1px, transparent 1.4px);
    background-size: 12px 12px;
    -webkit-mask-image: radial-gradient(70% 55% at 50% 38%, #000 0%, transparent 100%);
    mask-image: radial-gradient(70% 55% at 50% 38%, #000 0%, transparent 100%);
  }
  .lb-row { animation: lb-rise .42s cubic-bezier(.2,.7,.2,1) both; }
  .lb-banner {
    position: relative;
    overflow: hidden;
    transform-origin: 50% 100%;
    animation: lb-block .5s cubic-bezier(.2,.7,.2,1) both;
    animation-delay: inherit;
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,.85),
      inset 0 -14px 22px rgba(0,0,0,.20),
      0 12px 24px rgba(0,0,0,.45);
  }
  /* The block's lit top face. */
  .lb-banner::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 8px;
    background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
    pointer-events: none;
  }
  .lb-banner-1 { background: linear-gradient(160deg, #FFF1A8 0%, #F7C948 24%, #E0A106 50%, #F9D65C 72%, #B67C00 100%); }
  .lb-banner-2 { background: linear-gradient(160deg, #FFFFFF 0%, #D5DBE3 24%, #A4AEBB 50%, #E8ECF1 72%, #7E8896 100%); }
  .lb-banner-3 { background: linear-gradient(160deg, #FFD3A8 0%, #E39A5C 24%, #B8632A 50%, #EDB083 72%, #7F3F12 100%); }
  /* One pass of light across the gold, after it rises. It never loops. */
  .lb-banner-1::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.7) 50%, transparent 65%) no-repeat;
    background-size: 250% 100%;
    background-position: -60% 0;
    animation: lb-sweep 1.1s ease-in-out .7s 1 both;
  }
  /* The viewer's block: the ring is the block's own shadow, so it shares its edges and radius. */
  .lb-banner[data-you-block] {
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,.85),
      inset 0 -14px 22px rgba(0,0,0,.20),
      0 0 0 3px ${LB_YOU},
      0 0 26px 4px rgba(139,92,246,.65);
  }
  .lb-engraved { color: rgba(0,0,0,.30); text-shadow: 0 1px 0 rgba(255,255,255,.45); }
  .lb-ring-1 { background: linear-gradient(135deg, #FFF3B0, #D99A00); }
  .lb-ring-2 { background: linear-gradient(135deg, #FFFFFF, #8D97A3); }
  .lb-ring-3 { background: linear-gradient(135deg, #F6BC8A, #8A4314); }
  .lb-crown { color: #F7C948; filter: drop-shadow(0 2px 6px rgba(247,201,72,.55)); }
  .lb-ghost-1 { border-color: #F5B700; background: rgba(245,183,0,.06); color: #F5B700; }
  .lb-ghost-2 { border-color: #C3CBD4; background: rgba(195,203,212,.05); color: #C3CBD4; }
  .lb-ghost-3 { border-color: #C46A2B; background: rgba(196,106,43,.07); color: #E09A66; }
  .lb-week-thumb { transition: transform .22s cubic-bezier(.2,.7,.2,1); }
  .lb-clock-cell {
    display: inline-flex;
    align-items: baseline;
    gap: 1px;
    height: 32px;
    padding: 0 6px;
    border-radius: 8px;
    line-height: 32px;
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 1rem;
    font-weight: 500;
    color: #fff;
    background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.14);
  }
  .lb-clock-unit { font-size: .6875rem; color: #a1a1aa; }
  @media (min-width: 380px) {
    .lb-clock-cell { height: 36px; padding: 0 8px; line-height: 36px; font-size: 1.125rem; }
  }
  .lb-sheet { animation: lb-sheet .26s cubic-bezier(.2,.7,.2,1) both; }
  .lb-scrim { animation: lb-fade .2s ease-out both; }
  [data-rules] summary::-webkit-details-marker, .lb-spot summary::-webkit-details-marker { display: none; }
  .lb-spot details[open] .lb-chevron { transform: rotate(180deg); }
  @media (prefers-reduced-motion: reduce) {
    .lb-row, .lb-banner, .lb-banner-1::after, .lb-panel, .lb-sheet, .lb-scrim { animation: none; }
    .lb-week-thumb { transition: none; }
  }
`;

function boardAccent(boardId: string): string {
  return BOARD_ACCENT[boardId] ?? "#7c5cff";
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-11 font-medium leading-none text-white">
      {children}
    </span>
  );
}

/** Up, down or level against last week's top 10. Purple up, grey down: the arrow carries the direction. */
function MoveChip({ move }: { move: RankMove }) {
  const Icon = move.direction === "up" ? ChevronUp : move.direction === "down" ? ChevronDown : Minus;
  return (
    <span
      data-move={move.direction}
      className={`inline-flex shrink-0 items-center font-mono text-11 font-medium leading-none tabular-nums ${
        move.direction === "up" ? "text-[#C4B5FD]" : "text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />
      {move.places > 0 ? <span aria-hidden="true">{move.places}</span> : null}
      <span className="sr-only">{moveLabel(move)}</span>
    </span>
  );
}

/** New to the board, the move from last week, and the viewer's mark. Each only when it is true. */
function Chips({ entry }: { entry: BoardRow }) {
  if (!entry.isNew && !entry.move && !entry.mine) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {entry.mine ? <Tag>{YOU_LABEL}</Tag> : null}
      {entry.isNew ? <Tag>New</Tag> : entry.move ? <MoveChip move={entry.move} /> : null}
    </span>
  );
}

function person(entry: BoardRow, boardId: string): { name: string; handle: string; card: string; username: string } {
  const handle = entry.subtitle.trim().startsWith("@") ? entry.subtitle.trim() : "";
  const stripped = handle.replace(/^@/, "");
  if (boardId === "top-card-post") {
    const card = entry.title.trim();
    return { name: stripped || card, handle, card: stripped ? card : "", username: stripped };
  }
  return { name: entry.title.trim() || stripped, handle, card: "", username: stripped };
}

const FOCUS_RING =
  "touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";

/** The key a row and its sheet share. */
function collectorKey(boardId: string, entry: BoardRow): string {
  return `${boardId}:${entry.id}`;
}

/**
 * A place or a row. With a clean profile it is that profile's link, and a tap
 * opens the collector's sheet (components/leaderboard-stage.tsx). A handle
 * that can't make a clean `/u/` path stays a plain block.
 */
function RowShell({
  entry,
  boardId,
  className,
  style,
  children,
}: {
  entry: BoardRow;
  boardId: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const href = profileCardsLinkFor(entry);
  if (!href) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-collector={collectorKey(boardId, entry)}
      aria-haspopup="dialog"
      className={`tap ${className} ${FOCUS_RING}`}
      style={style}
    >
      {children}
    </Link>
  );
}

/** #2 left, #1 centre, #3 right. DOM order stays 1, 2, 3 for screen readers. */
const PODIUM_ORDER: Record<number, string> = { 1: "order-2", 2: "order-1", 3: "order-3" };
const PODIUM_AVATAR: Record<number, number> = { 1: 68, 2: 52, 3: 52 };
const BLOCK_HEIGHT: Record<number, string> = { 1: "h-[132px]", 2: "h-[104px]", 3: "h-[84px]" };
const ENGRAVED_SIZE: Record<number, string> = { 1: "text-[3.5rem]", 2: "text-[2.75rem]", 3: "text-[2.25rem]" };

function thumbProps(photo: string): ReturnType<typeof getImageProps>["props"] | null {
  try {
    return getImageProps({ src: photo, alt: "", fill: true, sizes: "24px", quality: 75, loading: "lazy" }).props;
  } catch {
    // A photo next/image will not take keeps the plain placeholder tile.
    return null;
  }
}

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
  center = false,
}: {
  photos: readonly string[];
  max: number;
  width: number;
  height: number;
  more: boolean;
  center?: boolean;
}) {
  const shown = photos.slice(0, max);
  if (shown.length === 0) return null;
  const extra = more ? photos.length - shown.length : 0;
  return (
    <span data-photo-strip="" aria-hidden="true" className={`mt-1 flex items-center gap-1 ${center ? "justify-center" : ""}`}>
      {shown.map((photo) => (
        <span
          key={photo}
          className="relative block shrink-0 overflow-hidden rounded-[3px] bg-white/10 ring-1 ring-white/10"
          style={{ width, height }}
        >
          <Thumb photo={photo} />
        </span>
      ))}
      {extra > 0 ? (
        <span className="grid h-[18px] shrink-0 place-items-center rounded-full bg-white/10 px-1.5 font-mono text-11 font-medium leading-none tabular-nums text-zinc-200">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

function Thumb({ photo }: { photo: string }) {
  const props = thumbProps(photo);
  if (!props) return null;
  return (
    // getImageProps is next/image without its client code: this photo is drawn on the server only.
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt="" className="absolute inset-0 h-full w-full object-cover" />
  );
}

/**
 * One podium place: the collector above, the metal block below. The block
 * carries the score and the engraved place, and the viewer's ring.
 */
function PodiumPlace({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const labels = person(entry, boardId);
  const rank = entry.rank;
  return (
    <RowShell entry={entry} boardId={boardId} className="flex min-h-11 min-w-0 flex-col items-center rounded-xl text-center">
      {rank === 1 ? (
        <Crown data-crown="" aria-hidden="true" className="lb-crown -mb-0.5 h-6 w-6 fill-current" strokeWidth={1.5} />
      ) : null}
      <span className={`lb-ring-${rank} shrink-0 rounded-full p-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.45)]`}>
        <span className="block rounded-full p-[2px]" style={{ backgroundColor: LB_CARD_TOP }}>
          <LeaderboardAvatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={PODIUM_AVATAR[rank] ?? 52} />
        </span>
      </span>
      <span className="mt-2 flex w-full min-w-0 items-center justify-center gap-1">
        <span
          className={`min-w-0 truncate font-semibold tracking-tight text-white ${rank === 1 ? "text-17" : "text-15"}`}
        >
          {labels.name}
        </span>
        <TeamBadge username={labels.username} inLink />
      </span>
      {labels.card ? <span className="block w-full min-w-0 truncate text-12 text-zinc-300">{labels.card}</span> : null}
      {boardId === "most-cards-added" ? (
        <PhotoStrip photos={entry.photos ?? []} max={3} width={22} height={31} more center />
      ) : null}
      <span className="mt-1 flex min-h-4 items-center justify-center">
        <Chips entry={entry} />
      </span>
      <span
        data-you-block={entry.mine ? "" : undefined}
        className={`lb-banner lb-banner-${rank} mt-2 flex w-full flex-col items-center justify-between rounded-xl pt-3 pb-1 text-zinc-950 ${
          BLOCK_HEIGHT[rank] ?? "h-[84px]"
        }`}
      >
        <span className="relative flex flex-col items-center">
          <LeaderboardCount
            value={entry.score}
            className={`font-semibold leading-none tracking-tight tabular-nums ${rank === 1 ? "text-[2rem]" : "text-[1.625rem]"}`}
          />
          {rank === 1 ? (
            <span className="mt-1 max-w-full truncate px-1 text-12 font-medium leading-none text-zinc-950/75">
              {entry.scoreLabel}
            </span>
          ) : (
            <span className="sr-only">{entry.scoreLabel}</span>
          )}
        </span>
        <span aria-hidden="true" className={`lb-engraved relative font-mono leading-none font-medium ${ENGRAVED_SIZE[rank] ?? ""}`}>
          {rank}
        </span>
        <span className="sr-only">{ordinal(rank)} place</span>
      </span>
    </RowShell>
  );
}

function GhostPlace({ spot }: { spot: OpenSpot }) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full border-2 border-dashed border-current opacity-60 ${spot.rank === 1 ? "h-[78px] w-[78px]" : "h-[62px] w-[62px]"}`}
      />
      <span className="mt-2 block w-full min-w-0 truncate px-1 text-13 font-medium tracking-tight text-zinc-200">
        {spot.title}
      </span>
      {spot.ctaLabel ? (
        <span className="block w-full min-w-0 truncate px-1 text-12 font-medium text-[#C4B5FD]">{spot.ctaLabel}</span>
      ) : null}
      <span
        className={`mt-2 flex w-full flex-col items-center justify-between rounded-xl border-2 border-dashed border-current pt-3 pb-1 ${
          BLOCK_HEIGHT[spot.rank] ?? "h-[84px]"
        }`}
      >
        {spot.ctaLabel ? (
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span aria-hidden="true" className={`font-mono leading-none font-medium opacity-70 ${ENGRAVED_SIZE[spot.rank] ?? ""}`}>
          {spot.rank}
        </span>
        <span className="sr-only">{ordinal(spot.rank)} place</span>
      </span>
    </>
  );
  const plain: CSSProperties = { background: "transparent" };
  const className = `lb-ghost lb-ghost-${spot.rank} flex min-h-11 min-w-0 flex-col items-center rounded-xl border-0 bg-transparent text-center`;
  if (!spot.ctaHref)
    return (
      <div className={className} style={plain}>
        {body}
      </div>
    );
  return (
    <Link href={spot.ctaHref} className={`${className} tap ${FOCUS_RING}`} style={plain}>
      {body}
    </Link>
  );
}

/**
 * The whole empty podium this week as one row: the three place marks, the
 * count and the join step. Each mark keeps its ghost rank.
 */
function OpenSpotsLine({
  row,
  ghosts,
  delay,
}: {
  row: OpenSpotsRow;
  ghosts: readonly OpenSpot[];
  delay: CSSProperties;
}) {
  const [count, join] = row.title.split(/(?<=\.)\s+/);
  return (
    <div className="lb-row" style={delay} data-podium="" data-open-spots={row.count}>
      <Link
        href={row.ctaHref}
        aria-label={row.title}
        className={`tap flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-dashed border-white/20 px-3 py-3 text-left transition-colors hover:border-violet-400/50 ${FOCUS_RING}`}
      >
        <span aria-hidden="true" className="flex shrink-0 -space-x-2">
          {ghosts.map((spot) => (
            <span
              key={spot.rank}
              data-ghost-rank={spot.rank}
              className={`lb-ghost lb-ghost-${spot.rank} h-9 w-9 rounded-full border-2 border-dashed`}
              style={{ background: LB_CARD_TOP }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-17 font-semibold tracking-tight text-white">
            {count?.replace(/\.$/, "")}
          </span>
          {join ? <span className="block truncate text-13 text-zinc-300">{join.replace(/\.$/, "")}</span> : null}
        </span>
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
          <Plus className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </Link>
    </div>
  );
}

function Podium({ board, delay }: { board: LeaderboardBoard; delay: (index: number) => CSSProperties }) {
  const top = board.entries.filter((entry) => entry.rank <= 3);
  if (board.openRow && top.length === 0) {
    return <OpenSpotsLine row={board.openRow} ghosts={board.ghosts} delay={delay(0)} />;
  }
  return (
    <ol className="relative grid grid-cols-3 items-end gap-2 pt-2" data-podium="">
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

/** Last week's top names under a thin board's open spots. Quiet: no podium colours. */
function LastWeekPreview({ board }: { board: LeaderboardBoard }) {
  if (board.lastWeekTop.length === 0) return null;
  const labelId = `board-${board.id}-last-week`;
  return (
    <div data-last-week-preview="" className="relative mt-4 rounded-2xl border border-white/10 bg-black/15 px-1 pt-3 pb-1">
      <p id={labelId} className="px-2 font-mono text-12 text-zinc-400">
        {LAST_WEEK_LABEL}
      </p>
      <ol aria-labelledby={labelId} className="mt-1">
        {board.lastWeekTop.map((row) => (
          <li key={row.rank}>
            <LastWeekLine row={row} />
          </li>
        ))}
      </ol>
      <Link
        href={leaderboardHref("previous", board.id)}
        className={`flex min-h-11 items-center rounded-xl px-2 text-13 font-medium text-[#C4B5FD] transition-colors hover:text-white ${FOCUS_RING}`}
      >
        See last week
      </Link>
    </div>
  );
}

function LastWeekLine({ row }: { row: LastWeekRow }) {
  const className = "flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-white/[0.05]";
  const body = (
    <>
      <span className="w-5 shrink-0 text-center font-mono text-13 font-medium tabular-nums text-zinc-400">{row.rank}</span>
      <LeaderboardAvatar title={row.displayName} accent="#3f3f46" url={row.avatarUrl} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{row.displayName}</span>
      <span className="shrink-0 whitespace-nowrap text-13 tabular-nums text-zinc-400">{row.scoreText}</span>
    </>
  );
  if (!row.username) return <div className={className}>{body}</div>;
  return (
    <Link href={userHref(row.username)} className={`${className} ${FOCUS_RING}`}>
      {body}
    </Link>
  );
}

/** Places 4 to 10: the rank, the collector, and the score as a number. The board names the unit once, on 1st. */
function RankRow({ entry, boardId }: { entry: BoardRow; boardId: string }) {
  const labels = person(entry, boardId);
  return (
    <RowShell
      entry={entry}
      boardId={boardId}
      className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.05]"
      style={entry.mine ? { backgroundColor: YOU_TINT, boxShadow: `inset 0 0 0 1.5px ${LB_YOU}` } : undefined}
    >
      <span
        data-rank-numeral=""
        className="w-7 shrink-0 text-center font-mono text-17 font-medium tabular-nums"
        style={{ color: LB_RANK_TEXT }}
      >
        {entry.rank}
      </span>
      <LeaderboardAvatar title={labels.name} accent={entry.accent} url={entry.avatarUrl} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-15 font-semibold tracking-tight text-white">{labels.name}</span>
          <TeamBadge username={labels.username} inLink />
          <Chips entry={entry} />
        </span>
        {labels.card ? <span className="block truncate text-12 text-zinc-300">{labels.card}</span> : null}
        {boardId === "most-cards-added" ? (
          <PhotoStrip photos={entry.photos ?? []} max={4} width={20} height={28} more={false} />
        ) : null}
      </span>
      <span className="shrink-0 text-right font-mono text-17 font-medium tabular-nums text-white">
        {entry.score}
        <span className="sr-only"> {entry.scoreLabel}</span>
      </span>
    </RowShell>
  );
}

const ACTION_CLASS = `tap inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-violet-600 px-4 text-center text-sm font-semibold leading-4 text-white hover:bg-violet-500 ${FOCUS_RING}`;

/** The board's own next step, with its existing label and page. */
function spotAction(boardId: string): { href: string; label: string } {
  const cta = boardCallToAction(boardId, "current");
  if (boardId === "most-cards-added") return { href: cta.href, label: "Add card" };
  if (boardId === "rising-collectors") return { href: cta.href, label: "Find collectors" };
  return { href: cta.href, label: cta.label };
}

function rankShare(boardId: string, week: "current" | "previous", rank: number): RankShare {
  return {
    imagePath: rankSharePath(boardId, week),
    link: rankShareLink(boardId, week),
    text: rankShareText(rank, boardId, week),
  };
}

/** You against the place you are chasing, or the place chasing you: two real scores as two bars. */
function Chase({ you }: { you: YouRow }) {
  const rival = you.rival;
  if (!rival) return null;
  const theirs = you.rank === 1 ? you.score - rival.need : you.score + rival.need;
  const max = Math.max(you.score, theirs, 1);
  const rows = [
    { key: "you", name: YOU_LABEL, score: you.score, mine: true },
    { key: "rival", name: rival.handle, score: theirs, mine: false },
  ];
  if (you.rank !== 1) rows.reverse();
  return (
    <dl data-chase="" className="grid grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-x-3 gap-y-2 text-13">
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className={`max-w-[9rem] truncate ${row.mine ? "font-semibold text-white" : "text-zinc-300"}`}>{row.name}</dt>
          <dd aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(4, (row.score / max) * 100)}%`, backgroundColor: row.mine ? LB_YOU : "#71717a" }}
            />
          </dd>
          <dd className="font-mono font-medium tabular-nums text-white">{row.score}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The viewer's spot, pinned just above the bottom tab bar while its board is
 * on screen. CSS sticky only. Ranked this week, it is a disclosure: the rank
 * and what is next, and a tap opens the two scores and the board's next step.
 * Sharing the rank is always one tap. Last week is read-only.
 */
function PinnedSpot({ you, board, week }: { you: YouRow; board: LeaderboardBoard; week: "current" | "previous" }) {
  if (week === "previous" && you.rank <= 0) return null;
  const hook = spotHook(you, board.scoreLabel, week);
  const action = spotAction(board.id);
  const shell =
    "lb-spot sticky z-10 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-3 min-h-14 rounded-2xl bg-[#24124D]/90 shadow-[0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-violet-300/25 backdrop-blur";
  const label = <span className="sr-only">{you.label}</span>;

  if (you.rank <= 0) {
    return (
      <div data-your-spot="" className={`${shell} flex items-center gap-3 py-1.5 pr-2 pl-3`}>
        <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full border-2 border-dashed border-white/30" />
        <span className="min-w-0 flex-1 text-15 font-semibold tracking-tight text-white">{hook.line}</span>
        {label}
        <Link href={action.href} className={ACTION_CLASS}>
          {action.label}
        </Link>
      </div>
    );
  }

  const share = <ShareRankButton share={rankShare(board.id, week, you.rank)} />;
  if (week === "previous") {
    return (
      <div data-your-spot="" className={`${shell} flex items-center gap-3 py-1.5 pr-2 pl-4`}>
        <span className="min-w-0 flex-1 text-17 font-semibold tracking-tight text-white">{hook.line}</span>
        {label}
        {share}
      </div>
    );
  }

  return (
    <div data-your-spot="" className={`${shell} relative`}>
      <details className="group">
        <summary
          className={`flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl py-1.5 pr-[3.75rem] pl-4 ${FOCUS_RING}`}
        >
          <span className="shrink-0 font-mono text-[1.625rem] leading-none font-medium tracking-tight text-white tabular-nums">
            {hook.rank}
          </span>
          {hook.line ? (
            <span className="min-w-0 flex-1 text-sm leading-[1.2] font-semibold text-[#DDD6FE]">{hook.line}</span>
          ) : (
            <span className="flex-1" />
          )}
          {label}
          <ChevronUp aria-hidden="true" className="lb-chevron h-5 w-5 shrink-0 text-zinc-300" strokeWidth={1.75} />
        </summary>
        <div data-spot-more="" className="space-y-3 px-4 pt-1 pb-3">
          <Chase you={you} />
          <Link href={action.href} className={`${ACTION_CLASS} w-full`}>
            {action.label}
          </Link>
        </div>
      </details>
      <span className="absolute top-1.5 right-2">{share}</span>
    </div>
  );
}

function Board({ board, week }: { board: LeaderboardBoard; week: "current" | "previous" }) {
  const accent = boardAccent(board.id);
  const delay = (index: number): CSSProperties => ({ animationDelay: `${index * 45}ms` });
  const rest = board.entries.filter((entry) => entry.rank > 3);
  return (
    <section
      id={`board-${board.id}`}
      role="tabpanel"
      data-board={board.id}
      data-board-focus={board.focused ? "" : undefined}
      aria-labelledby={`board-${board.id}-title`}
      className="lb-panel relative scroll-mt-20 rounded-3xl border border-white/10 p-3"
      style={{ "--lb-accent": accent } as CSSProperties}
    >
      {/* The light and the floor sit in their own clipped layer, so nothing in the board is ever clipped. */}
      <div aria-hidden="true" className="lb-arena pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" />
      <h2 id={`board-${board.id}-title`} className="sr-only">
        {board.label}
      </h2>
      <Podium board={board} delay={delay} />
      <LastWeekPreview board={board} />
      <div data-board-rest="" className="relative">
        {rest.length > 0 ? (
          <ol className="relative mt-4 space-y-1" data-rank-rows="">
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

/** What each collector's sheet shows: only what their row already has. */
function sheetPeople(model: LeaderboardPageModel): Record<string, SheetPerson> {
  const people: Record<string, SheetPerson> = {};
  for (const board of model.boards) {
    for (const entry of board.entries) {
      const profileHref = profileLinkFor(entry);
      const cardsHref = profileCardsLinkFor(entry);
      if (!profileHref || !cardsHref) continue;
      const labels = person(entry, board.id);
      const photos =
        board.id === "most-cards-added"
          ? (entry.photos ?? []).flatMap((photo) => {
              const props = thumbProps(photo);
              return props?.src ? [{ src: props.src, srcSet: props.srcSet, sizes: props.sizes }] : [];
            })
          : [];
      const you = entry.mine && board.you && board.you.rank === entry.rank ? board.you : null;
      people[collectorKey(board.id, entry)] = {
        name: labels.name,
        handle: labels.handle,
        username: labels.username,
        avatarUrl: entry.avatarUrl,
        accent: entry.accent,
        rank: entry.rank,
        score: entry.score,
        scoreLabel: entry.scoreLabel,
        boardLabel: board.label,
        card: labels.card,
        profileHref,
        cardsHref,
        photos,
        you: you
          ? {
              line: spotHook(you, board.scoreLabel, model.week).line,
              cta: model.week === "current" ? spotAction(board.id) : null,
              share: rankShare(board.id, model.week, you.rank),
            }
          : null,
      };
    }
  }
  return people;
}

export function LeaderboardView({ model }: { model: LeaderboardPageModel }) {
  const closed = model.standing === FINAL_LABEL;
  const activeWeek = Math.max(0, model.weekLinks.findIndex((link) => link.active));
  return (
    <PullToRefresh className="-mx-4 -mt-5">
      <div
        className="min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] px-4 pt-4 pb-8 text-zinc-100"
        data-leaderboard=""
      >
        <style>{LEADERBOARD_STYLES}</style>
        <div className="relative flex items-center justify-between gap-2">
          <h1 className="min-w-0 text-[1.75rem] leading-tight font-semibold tracking-tight text-white">{model.title}</h1>
          <div className="flex shrink-0 items-center">
            <details data-rules="" className="group">
              <summary
                aria-label={RULES_SHEET_LABEL}
                className={`tap grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-white group-open:bg-white/10 group-open:text-white ${FOCUS_RING}`}
              >
                <Info aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
              </summary>
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1A0D3B] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                <p className="text-sm font-semibold text-white">{RULES_SHEET_LABEL}</p>
                <p className="mt-1 text-13 leading-5 text-zinc-300">{model.description}</p>
                <p className="mt-1 text-13 leading-5 text-zinc-300" data-rules-line="">
                  {model.rulesLine}
                </p>
                {model.standingNote ? (
                  <p className="mt-1 text-13 leading-5 text-zinc-300" data-closed-note="">
                    {model.standingNote}
                  </p>
                ) : null}
                <div className="mt-3 space-y-4">
                  {model.rules.map((board) => (
                    <div key={board.id}>
                      <p className="text-13 font-medium text-[#C4B5FD]">{board.label}</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-13 leading-5 text-zinc-300">
                        {board.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <span className="[&>button]:border-0 [&>button]:text-zinc-300 [&>button]:hover:bg-white/10 [&>button]:hover:text-white">
              <ShareIconButton path={LEADERBOARD_PATH} title={model.title} label="Share" />
            </span>
          </div>
        </div>

        <div className="relative mt-3 grid grid-cols-2 rounded-full bg-black/30 p-1 text-sm ring-1 ring-white/10" data-week-toggle="">
          <span
            aria-hidden="true"
            className="lb-week-thumb absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white"
            style={{ transform: `translateX(${activeWeek * 100}%)` }}
          />
          {model.weekLinks.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              scroll={false}
              aria-current={link.active ? "page" : undefined}
              className={`tap relative flex min-h-11 items-center justify-center rounded-full px-3 text-center font-semibold transition-colors duration-200 motion-reduce:transition-none ${FOCUS_RING} ${
                link.active ? "text-zinc-950" : "text-zinc-300"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div
          data-week-meta=""
          className="mt-2 flex min-h-14 items-center justify-between gap-2 rounded-2xl bg-black/25 px-3 py-2 ring-1 ring-white/10"
        >
          <p className="flex min-w-0 flex-col items-start gap-1.5">
            <span className="text-13 leading-none font-medium whitespace-nowrap text-white">{model.weekLabel}</span>
            <span
              data-standing=""
              className={`rounded-full px-2 py-1 text-11 leading-none font-medium ${
                closed ? "bg-white/10 text-zinc-300" : "bg-violet-400/20 text-[#C4B5FD]"
              }`}
            >
              {model.standing}
            </span>
          </p>
          {model.showCountdown ? <LeaderboardCountdown resetsAt={model.resetsAt} initial={model.countdown} /> : null}
        </div>

        {model.status === "error" ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 px-6 py-12 text-center" data-board-error="">
            <p className="text-17 font-semibold tracking-tight text-white">{model.errorTitle}</p>
            <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-300">{model.errorDetail}</p>
            <LeaderboardRetry />
          </div>
        ) : (
          <div className="mt-4">
            <LeaderboardStage
              tabs={model.boards.map((board) => ({ id: board.id, label: board.label }))}
              initial={model.focusBoardId ?? model.boards[0]?.id ?? ""}
              focus={model.focusBoardId}
              week={model.week}
              people={sheetPeople(model)}
            >
              {model.boards.map((board) => (
                // A new week is a new board: it rises in again, and the tabs keep their place.
                <Board key={`${model.week}:${board.id}`} board={board} week={model.week} />
              ))}
            </LeaderboardStage>
          </div>
        )}
        {model.focusBoardId ? <LeaderboardFocus boardId={model.focusBoardId} /> : null}
      </div>
    </PullToRefresh>
  );
}
