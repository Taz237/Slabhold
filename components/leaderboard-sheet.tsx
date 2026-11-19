"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LeaderboardAvatar } from "@/components/leaderboard-avatar";
import { ShareRankButton, type RankShare } from "@/components/leaderboard-share-rank";
import { TeamBadge } from "@/components/team-badge";
import { useFocusTrap } from "@/lib/ui/focus-trap";

/** One collector, as their board row already shows them. Built on the server from the page model. */
export type SheetPerson = {
  name: string;
  /** "@handle", or "". */
  handle: string;
  username: string;
  avatarUrl: string | null;
  accent: string;
  rank: number;
  score: number;
  scoreLabel: string;
  boardLabel: string;
  /** Top card post only: the card the post is about. */
  card: string;
  profileHref: string;
  /** The profile's Cards tab. Each photo opens it. */
  /** Public photos of this period's counted cards, at most 4. Most cards added only. */
  photos: { src: string; srcSet?: string; sizes?: string }[];
  /** The viewer's own row: what is next, the board's step, and their rank to share. */
  you: {
    line: string;
    cta: { href: string; label: string } | null;
    share: RankShare;
  } | null;
};

/** Past this many px of downward drag on the handle, letting go closes the sheet. */
const DISMISS_PX = 72;

const ACTION =
  "tap inline-flex min-h-12 flex-1 items-center justify-center rounded-full px-5 text-15 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";

/**
 * A collector's sheet, up from the bottom: who they are, their real place and
 * score, this period's public card photos, and the way to their profile.
 * Closes on the scrim, Escape, the close button, or a drag down on the handle.
 * Focus stays inside while it is open and returns to the row on close.
 */
export function LeaderboardSheet({ person, onClose }: { person: SheetPerson; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; startY: number; dy: number } | null>(null);
  useFocusTrap(panel);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function move(dy: number, settle: boolean) {
    const el = panel.current;
    if (!el) return;
    el.style.transition = settle ? "transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1)" : "none";
    el.style.transform = dy > 0 ? `translate3d(0, ${dy}px, 0)` : "";
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = { id: event.pointerId, startY: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    state.dy = Math.max(0, event.clientY - state.startY);
    move(state.dy, false);
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (state.dy > DISMISS_PX) onClose();
    else move(0, true);
  }

  const you = person.you;
  return createPortal(
    <div data-collector-sheet="" className="fixed inset-0 z-[60]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="lb-scrim absolute inset-0 h-full w-full cursor-default touch-none bg-black/60"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-sheet-name"
        className="lb-sheet absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/15 bg-[#1A0D3B] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-100 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
      >
        <div
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="-mx-5 flex h-8 touch-none items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-white/25" />
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="tap absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-4 pr-12">
          <span className={`shrink-0 rounded-full p-[3px] ${person.rank <= 3 ? `lb-ring-${person.rank}` : "bg-white/15"}`}>
            <span className="block rounded-full bg-[#1A0D3B] p-[2px]">
              <LeaderboardAvatar title={person.name} accent={person.accent} url={person.avatarUrl} size={64} />
            </span>
          </span>
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5">
              <span id="lb-sheet-name" className="min-w-0 truncate text-xl font-semibold tracking-tight text-white">
                {person.name}
              </span>
              <TeamBadge username={person.username} />
            </p>
            {person.handle ? <p className="truncate font-mono text-13 text-zinc-400">{person.handle}</p> : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
            <dd className="font-mono text-[2rem] font-medium leading-none tracking-tight text-white tabular-nums">
              #{person.rank}
            </dd>
            <dt className="mt-1.5 truncate text-13 text-zinc-400">{person.boardLabel}</dt>
          </div>
          <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
            <dd className="font-mono text-[2rem] font-medium leading-none tracking-tight text-white tabular-nums">
              {person.score}
            </dd>
            <dt className="mt-1.5 truncate text-13 text-zinc-400">{person.scoreLabel}</dt>
          </div>
        </dl>

        {person.card ? <p className="mt-4 text-15 font-medium text-zinc-200">{person.card}</p> : null}

        {person.photos.length > 0 ? (
          <ul data-sheet-photos="" className="mt-4 flex gap-2">
            {person.photos.map((photo, index) => (
              <li key={photo.src} className="min-w-0 flex-1">
                <Link
                  href={person.profileHref}
                  onClick={onClose}
                  aria-label={`${person.name}'s cards, photo ${index + 1}`}
                  className="tap relative block aspect-[5/7] w-full overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                >
                  {/* The same optimized file the row's thumbnail already loaded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    srcSet={photo.srcSet}
                    sizes={photo.sizes}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </Link>
              </li>
            ))}
            {Array.from({ length: Math.max(0, 4 - person.photos.length) }, (_, index) => (
              <li key={`gap-${index}`} aria-hidden="true" className="min-w-0 flex-1" />
            ))}
          </ul>
        ) : null}

        {you ? <p className="mt-4 text-15 font-medium text-[#C4B5FD]">{you.line}</p> : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {you?.cta ? (
            <Link href={you.cta.href} onClick={onClose} className={`${ACTION} bg-violet-600 text-white hover:bg-violet-500`}>
              {you.cta.label}
            </Link>
          ) : null}
          {you ? <ShareRankButton share={you.share} variant={you.cta ? "icon" : "button"} className={you.cta ? "h-12 w-12" : "flex-1"} /> : null}
          <Link
            href={person.profileHref}
            onClick={onClose}
            className={`${ACTION} ${you ? "basis-full bg-transparent text-[#C4B5FD] hover:bg-white/5" : "bg-violet-600 text-white hover:bg-violet-500"}`}
          >
            View profile
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
