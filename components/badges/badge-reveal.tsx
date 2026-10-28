"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/badges/badge";
import { ShareButton } from "@/components/share-sheet";
import { useReducedMotion } from "@/components/timeline-ui";
import { requestBadgeCheck } from "@/lib/badges/client";
import { MAX_PINNED_BADGES, TIER_LABELS, CATEGORY_COPY } from "@/lib/badges/config";
import { togglePin } from "@/lib/badges/pins";
import type { BadgeReveal } from "@/lib/badges/reveal";
import { markBadgesSeen, savePinnedBadges } from "@/lib/badges/save";
import { badgeImagePath, badgeSharePath, badgeShareText } from "@/lib/share/links";

const CHECKED_KEY = "badge-check:";

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

export function BadgeRevealView({
  reveal,
  pinned,
  username,
  onClose,
}: {
  reveal: BadgeReveal;
  pinned: readonly string[];
  /** The owner's handle. Share shows only when it is known. */
  username?: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const niceRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [pinState, setPinState] = useState<"idle" | "saving" | "pinned" | "full" | "error">(() =>
    pinned.includes(`${reveal.headline.category}:${reveal.headline.tier}`) ? "pinned" : "idle",
  );
  const { headline } = reveal;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    niceRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function onPin() {
    const result = togglePin(pinned, headline);
    if (result.full) {
      setPinState("full");
      return;
    }
    setPinState("saving");
    const saved = await savePinnedBadges(result.pins);
    setPinState(saved.ok ? "pinned" : "error");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-[#09090B] px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#F4F4F5]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,_rgba(124,58,237,0.42),_transparent_58%)]"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-[#A78BFA] uppercase">
          Badge unlocked
        </p>
        <div data-reveal-badge className={`relative mt-6 ${reduce ? "" : "badge-reveal-in"}`}>
          <Badge category={headline.category} tier={headline.tier} size={176} label="" />
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
        <div className={reduce ? "" : "badge-reveal-copy"}>
          <h2 id={titleId} className="mt-6 text-[28px] leading-tight font-extrabold tracking-tight">
            {reveal.title}
          </h2>
          {reveal.next ? (
            <p className="mt-2 text-[15px] text-zinc-400 tabular-nums">Next: {reveal.next}</p>
          ) : (
            <p className="mt-2 text-[15px] text-zinc-400">Top tier. Nothing left to chase here.</p>
          )}
          {reveal.others.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left">
              <p className="font-mono text-[10px] tracking-[0.14em] text-zinc-400 uppercase">Also earned</p>
              <ul className="mt-1.5 space-y-1.5">
                {reveal.others.slice(0, 4).map((badge) => (
                  <li key={badge.id} className="flex items-center gap-2 text-sm">
                    <Badge category={badge.category} tier={badge.tier} size={32} animate={false} label="" />
                    <span>
                      {TIER_LABELS[badge.tier]} {CATEGORY_COPY[badge.category].label}
                    </span>
                  </li>
                ))}
              </ul>
              {reveal.others.length > 4 ? (
                <p className="mt-1.5 text-xs text-zinc-400">+{reveal.others.length - 4} more</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-8 flex w-full flex-col gap-2.5">
          <div className="flex gap-2.5">
            {pinState === "full" ? (
              <Link
                href="/achievements"
                onClick={onClose}
                className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white"
              >
                Choose pins
              </Link>
            ) : (
              <button
                type="button"
                disabled={pinState === "saving" || pinState === "pinned"}
                onClick={() => void onPin()}
                className="min-h-12 flex-1 rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-70"
              >
                {pinState === "pinned" ? "Pinned to profile" : pinState === "saving" ? "Pinning…" : "Pin to profile"}
              </button>
            )}
            {username ? (
              <ShareButton
                variant="reveal"
                className="flex-1"
                target={{
                  path: badgeSharePath(username, headline.category, headline.tier),
                  title: `${TIER_LABELS[headline.tier]} ${CATEGORY_COPY[headline.category].label}`,
                  text: badgeShareText(headline.category, headline.tier),
                  imagePath: badgeImagePath(username, headline.category, headline.tier),
                  source: "badge",
                }}
              />
            ) : null}
          </div>
          <button
            ref={niceRef}
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-full border border-white/15 px-5 text-[15px] font-semibold"
          >
            Nice
          </button>
          <p role="status" className="min-h-5 text-xs text-zinc-400">
            {pinState === "full"
              ? `You already pinned ${MAX_PINNED_BADGES}. Unpin one to make room.`
              : pinState === "error"
                ? "Couldn't pin it. Try again from Achievements."
                : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
