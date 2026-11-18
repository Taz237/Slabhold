"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/badges/badge";
import { ShareButton } from "@/components/share-sheet";
import { useReducedMotion } from "@/components/timeline-ui";
import { requestBadgeCheck } from "@/lib/badges/client";
import {
  BADGE_TIERS,
  CATEGORY_COPY,
  MAX_PINNED_BADGES,
  badgeName,
  type BadgeTier,
} from "@/lib/badges/config";
import { formatPin, togglePin } from "@/lib/badges/pins";
import type { BadgeReveal } from "@/lib/badges/reveal";
import { markBadgesSeen, savePinnedBadges } from "@/lib/badges/save";
import { badgeImagePath, badgeSharePath, badgeShareText } from "@/lib/share/links";

const CHECKED_KEY = "badge-check:";

/** Each tier's metal, from public/badges/frames/frame-<tier>.svg. The sparks take it. */
export const SPARK_COLORS: Record<BadgeTier, string> = {
  bronze: "#D49A6A",
  silver: "#8D96A3",
  gold: "#F4C64A",
  platinum: "#DCE4EF",
  diamond: "#E9FDFF",
  legendary: "#E9D5FF",
};

const SPARK_COUNT = 12;
/** When the flip lands, in ms. The sparks, the copy and the haptic start here. */
const LANDING_MS = 650;
/** A drag past this, or a fast flick, closes the reveal. */
const SWIPE_CLOSE_PX = 96;
const SWIPE_FLICK_PX_PER_MS = 0.6;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Nov 3, 2026" in the viewer's zone. A missing or bad date reads as today. */
export function earnedDateLabel(earnedAt: string | undefined, now: Date): string {
  const date = earnedAt ? new Date(earnedAt) : now;
  return dateFormat.format(Number.isNaN(date.getTime()) ? now : date);
}

/** "2 / 4 weeks to Gold" reads as "2 of 4 weeks to Gold" here. The data keeps the slash. */
export function nextStepLabel(next: string | null, tier: BadgeTier): string | null {
  if (next) return next.replace(" / ", " of ");
  return tier === BADGE_TIERS[BADGE_TIERS.length - 1] ? "Top tier. Nothing left to chase here." : null;
}

/** Checks once per app open, then shows the reveal for unseen badges. */
export function BadgeRevealGate({ userId, username }: { userId: string; username?: string }) {
  const [reveal, setReveal] = useState<{ reveal: BadgeReveal; pinned: string[] } | null>(null);

  useEffect(() => {
    const key = `${CHECKED_KEY}${userId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode: still check once for this mount.
    }
    let cancelled = false;
    void requestBadgeCheck().then((result) => {
      if (cancelled || !result?.available || !result.reveal) return;
      setReveal({ reveal: result.reveal, pinned: result.pinned });
      void markBadgesSeen(result.reveal.ids);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!reveal) return null;
  return (
    <BadgeRevealView
      reveal={reveal.reveal}
      pinned={reveal.pinned}
      username={username}
      onClose={() => setReveal(null)}
    />
  );
}

/**
 * The share image, fetched when the reveal opens so the tap never waits on it.
 * Until it lands, or if it fails, Share sends the link alone.
 */
function usePrefetchedFile(src: string | null, name: string) {
  const file = useRef<File | null>(null);
  useEffect(() => {
    file.current = null;
    if (!src || typeof fetch !== "function" || typeof File !== "function") return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => fetch(src))
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!cancelled && blob) file.current = new File([blob], name, { type: blob.type || "image/png" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, name]);
  return file;
}

export function BadgeRevealView({
  reveal,
  pinned,
  username,
  onClose,
  savePins = savePinnedBadges,
}: {
  reveal: BadgeReveal;
  /** The pins the profile shows now, auto pins included. */
  pinned: readonly string[];
  /** The owner's handle. Share shows only when it is known. */
  username?: string;
  onClose: () => void;
  /** Tests pass a fake. */
  savePins?: typeof savePinnedBadges;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const { headline } = reveal;
  const [pins, setPins] = useState<readonly string[]>(pinned);
  const [pinState, setPinState] = useState<"idle" | "saving" | "full" | "error">("idle");
  const [unpinned, setUnpinned] = useState(false);
  const isPinned = pins.includes(formatPin(headline));
  const [dateLabel] = useState(() => earnedDateLabel(headline.earnedAt, new Date()));
  const nextLine = nextStepLabel(reveal.next, headline.tier);
  const imageFile = usePrefetchedFile(
    username ? badgeImagePath(username, headline.category, headline.tier) : null,
    `slabhold-badge-${headline.category}-${headline.tier}.png`,
  );

  useEffect(() => {
    const previous = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    // The dialog takes focus, not a button, so no ring shows on open.
    dialogRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const active = document.activeElement;
      // Another sheet on top, like our share sheet, keeps its own focus.
      if (!dialog || (active && active !== document.body && !dialog.contains(active))) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // A light tick as the badge lands, where the device has one. iOS Safari has none.
  // Before any tap Chrome blocks it and logs an error, so skip it then.
  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => {
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
      if (typeof navigator.vibrate === "function" && activation?.hasBeenActive) navigator.vibrate(8);
    }, LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  // "Unpinned" stays up for 4s, long enough to read and undo.
  useEffect(() => {
    if (!unpinned) return;
    const timer = window.setTimeout(() => setUnpinned(false), 4000);
    return () => window.clearTimeout(timer);
  }, [unpinned]);

  async function onPin() {
    if (pinState === "saving") return;
    const removing = isPinned;
    const result = togglePin(pins, headline);
    if (result.full) {
      setPinState("full");
      return;
    }
    setPinState("saving");
    setUnpinned(false);
    const saved = await savePins(result.pins);
    if (!saved.ok) {
      setPinState("error");
      return;
    }
    setPins(result.pins);
    setPinState("idle");
    setUnpinned(removing);
  }

  // Swipe down to close: translateY only, straight on the node so a drag never re-renders.
  const drag = useRef<{ id: number; y: number; t: number; dy: number; active: boolean } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || !panelRef.current?.contains(event.target as Node)) return;
    drag.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0, active: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || !panel || state.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - state.y);
    if (!state.active) {
      if (dy < 8) return;
      state.active = true;
      panel.setPointerCapture?.(event.pointerId);
      panel.style.transition = "none";
    }
    state.dy = dy;
    panel.style.transform = `translateY(${dy}px)`;
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!state || !panel || !state.active || state.id !== event.pointerId) return;
    const speed = state.dy / Math.max(1, event.timeStamp - state.t);
    const close = event.type === "pointerup" && (state.dy > SWIPE_CLOSE_PX || (state.dy > 24 && speed > SWIPE_FLICK_PX_PER_MS));
    panel.style.transition = reduce ? "none" : `transform 300ms ${EASE}`;
    if (close) {
      panel.style.transform = "translateY(100%)";
      if (reduce) onCloseRef.current();
      else window.setTimeout(() => onCloseRef.current(), 200);
      return;
    }
    panel.style.transform = "";
  }

  const target = username
    ? {
        path: badgeSharePath(username, headline.category, headline.tier),
        title: badgeName(headline.category, headline.tier),
        text: badgeShareText(headline.category, headline.tier),
        imagePath: badgeImagePath(username, headline.category, headline.tier),
        // Read on the tap, so a file that landed after render still goes along.
        get files() {
          return imageFile.current ? [imageFile.current] : undefined;
        },
        source: "badge" as const,
      }
    : null;

  const secondary =
    "tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-15 font-medium text-[#F4F4F5] transition-colors hover:bg-white/[0.06]";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onClick={(event) => {
        // On sm+ the panel floats over a backdrop. A tap on the backdrop closes it.
        if (event.target === event.currentTarget) onClose();
      }}
      className="badge-reveal fixed inset-0 z-[60] flex justify-center overflow-y-auto overscroll-contain bg-[#09090B] text-[#F4F4F5] outline-none sm:items-center sm:bg-black/60 sm:p-6"
    >
      <div
        ref={panelRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative flex min-h-full w-full flex-col bg-[#09090B] px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:min-h-0 sm:max-w-[420px] sm:rounded-2xl sm:border sm:border-white/10 sm:pt-3 sm:pb-6"
      >
        <div className="-mr-3 flex touch-none justify-end">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="tap grid h-11 w-11 place-items-center rounded-full bg-white/10 text-[#F4F4F5] transition-colors hover:bg-white/[0.14]"
          >
            <X aria-hidden size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <div className="relative grid touch-none place-items-center [perspective:800px]">
            {reduce ? null : (
              <span
                aria-hidden
                className="badge-reveal-sparks pointer-events-none absolute inset-0"
                style={{ "--spark": SPARK_COLORS[headline.tier] } as CSSProperties}
              >
                {Array.from({ length: SPARK_COUNT }, (_, index) => (
                  <i key={index} style={{ "--a": `${(360 / SPARK_COUNT) * index}deg` } as CSSProperties} />
                ))}
              </span>
            )}
            <div data-reveal-badge className={`relative grid ${reduce ? "" : "badge-reveal-in"}`}>
              <Badge category={headline.category} tier={headline.tier} size={176} animate={false} label="" />
              {reduce ? null : (
                <span
                  aria-hidden
                  className="badge-reveal-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_42%,rgba(255,255,255,0.55)_50%,transparent_58%)] bg-[length:300%_100%] bg-no-repeat mix-blend-soft-light"
                  style={{
                    maskImage: `url(/badges/locked/frame-locked-${headline.tier}.svg)`,
                    WebkitMaskImage: `url(/badges/locked/frame-locked-${headline.tier}.svg)`,
                    maskSize: "100% 100%",
                    WebkitMaskSize: "100% 100%",
                  }}
                />
              )}
            </div>
          </div>

          <div className={`mt-8 flex w-full flex-col items-center ${reduce ? "" : "badge-reveal-copy"}`}>
            <p className="font-mono text-13 text-zinc-400 tabular-nums">{dateLabel}</p>
            <h2 id={titleId} className="mt-2 text-[1.75rem] leading-9 font-semibold">
              {badgeName(headline.category, headline.tier)}
            </h2>
            <div className="mt-3 flex flex-col gap-1">
              <p className="text-15 leading-6 text-balance text-zinc-300">{CATEGORY_COPY[headline.category].rule}</p>
              {nextLine ? <p className="text-15 leading-6 text-zinc-400 tabular-nums">{nextLine}</p> : null}
            </div>
            {reveal.others.length > 0 ? (
              <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left">
                <p className="text-12 text-zinc-400">Also earned</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {reveal.others.slice(0, 4).map((badge) => (
                    <li key={badge.id} className="flex items-center gap-2 text-sm">
                      <Badge category={badge.category} tier={badge.tier} size={32} animate={false} label="" />
                      <span>{badgeName(badge.category, badge.tier)}</span>
                    </li>
                  ))}
                </ul>
                {reveal.others.length > 4 ? (
                  <p className="mt-2 text-12 text-zinc-400 tabular-nums">+{reveal.others.length - 4} more</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p role="status" className="min-h-5 text-center text-13 leading-5 text-zinc-400">
            {pinState === "full"
              ? `You already pinned ${MAX_PINNED_BADGES}. Unpin one to make room.`
              : pinState === "error"
                ? isPinned
                  ? "Couldn't unpin it. Try again from Achievements."
                  : "Couldn't pin it. Try again from Achievements."
                : unpinned
                  ? "Unpinned. Tap Pin to profile to undo."
                  : ""}
          </p>
          {pinState === "full" ? (
            <Link href="/achievements" onClick={onClose} className={secondary}>
              Choose pins
            </Link>
          ) : (
            <button
              type="button"
              aria-busy={pinState === "saving" || undefined}
              onClick={() => void onPin()}
              className={secondary}
            >
              {pinState === "saving" ? (
                "Saving…"
              ) : isPinned ? (
                <>
                  <Check aria-hidden size={16} strokeWidth={1.5} />
                  Pinned
                </>
              ) : (
                "Pin to profile"
              )}
            </button>
          )}
          {target ? (
            <div className="badge-reveal-cta">
              <ShareButton variant="primary" target={target} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
