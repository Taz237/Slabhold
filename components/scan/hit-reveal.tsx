"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Share2, X } from "lucide-react";
import { haptic } from "@/lib/ios/haptics";
import { setWithInsert } from "@/lib/scan/confirm";
import { HIT_COPY, hitLabel, hitPlan, shakeOffset, streakShown, type Hit, type HitPlan } from "@/lib/scan/hit";
import { clipSupported, hitRevealsOn, hitStreak, reducedMotion, setHitReveals, subscribeHits } from "@/lib/scan/hit-store";
import type { ScanMatch } from "@/lib/scan/match";

/** The card photo, loaded and decoded. Rejects on a photo that won't load: the reveal falls back. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("hit: photo failed to load"));
    image.src = src;
  });
}

/**
 * The effect's layer. Light mode: exactly the stage's dark backdrop, rounded like it, so the storm's
 * haze, the pixels and the shards never drift onto the light sheet around it. Dark mode: the sheet
 * is as dark as the stage's edge, so the layer runs a little past it, as before.
 */
const HIT_CANVAS =
  "pointer-events-none absolute inset-0 z-20 h-full w-full rounded-2xl dark:-inset-x-5 dark:-top-6 dark:-bottom-28 dark:h-[calc(100%+8.5rem)] dark:w-[calc(100%+2.5rem)] dark:rounded-none";

/** The renderer never holds a slow phone up: no first frame by now and the normal reveal plays. */
const START_BY_MS = 450;

/**
 * The hit effect over the reveal's stage: a clear WebGL layer above the collector's real card. It
 * loads its renderer on demand, plays once on the plan's clock, shakes the stage on the hit, fires
 * the haptics, then frees the GPU. Anything going wrong (no WebGL, a photo it can't read, a thrown
 * error) calls onFail and the normal reveal plays instead.
 *
 * Must sit inside the reveal's stage ([data-reveal="scan-card"]).
 */
export function HitReveal({ hit, plan, photo, onDone, onFail }: { hit: Hit; plan: HitPlan; photo: string; onDone: () => void; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  const fail = useRef(onFail);
  useEffect(() => {
    done.current = onDone;
    fail.current = onFail;
  });

  useEffect(() => {
    const surface = canvas.current;
    const stage = surface?.closest<HTMLElement>('[data-reveal="scan-card"]');
    const card = stage?.querySelector<HTMLElement>(":scope > div");
    const body = card?.querySelector<HTMLElement>("[data-reveal-body]");
    if (!surface || !stage || !card) {
      fail.current();
      return;
    }
    let live = true;
    let frame = 0;
    let dispose: (() => void) | null = null;
    let started = false;
    surface.style.visibility = "";
    const reset = () => {
      // A canvas whose context was just freed can paint white for a frame: hide it first.
      surface.style.visibility = "hidden";
      stage.style.transform = "";
      if (body) body.style.opacity = "";
    };
    const giveUp = () => {
      if (!live) return;
      live = false;
      window.cancelAnimationFrame(frame);
      reset();
      dispose?.();
      fail.current();
    };
    const lateStart = window.setTimeout(() => {
      if (!started) giveUp();
    }, START_BY_MS);

    Promise.all([import("@/lib/scan/hit-fx/engine"), import("@/lib/scan/hit-fx/timeline"), loadImage(photo)])
      .then(([engine, timeline, image]) => {
        if (!live) return;
        const box = surface.getBoundingClientRect();
        const at = card.getBoundingClientRect();
        if (!box.width || !at.width) throw new Error("hit: no layout");
        const fx = engine.createHitFx({
          canvas: surface,
          photo: image,
          effect: hit.effect,
          strength: hit.strength,
          width: box.width,
          height: box.height,
          card: { x: at.left - box.left, y: at.top - box.top, w: at.width, h: at.height },
          scale: Math.min(window.devicePixelRatio || 1, 2),
          scene: false,
        });
        dispose = fx.dispose;
        started = true;
        const zero = performance.now();
        let last = -1;
        const tick = (now: number) => {
          if (!live) return;
          const ms = now - zero;
          const picture = timeline.hitFrame(hit.effect, plan, ms);
          fx.render(picture, ms / 1000);
          if (body) body.style.opacity = String(picture.card);
          for (const beat of plan.buildHaptics) if (last < beat.atMs && ms >= beat.atMs) haptic(beat.moment);
          // The hit: the buzz and the shake start on the same frame.
          if (last < plan.impactMs && ms >= plan.impactMs) haptic(plan.impactHaptic);
          const shake = shakeOffset(ms - plan.impactMs, plan.shakePx);
          stage.style.transform = shake.x || shake.y ? `translate3d(${shake.x}px, ${shake.y}px, 0)` : "";
          last = ms;
          if (ms >= plan.durationMs) {
            live = false;
            reset();
            fx.dispose();
            done.current();
            return;
          }
          frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
      })
      .catch(giveUp);

    return () => {
      live = false;
      window.clearTimeout(lateStart);
      window.cancelAnimationFrame(frame);
      reset();
      dispose?.();
    };
    // Plays once for the hit it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas ref={canvas} aria-hidden data-hit={hit.effect} className={HIT_CANVAS} />
      {plan.first ? (
        <p className="pointer-events-none absolute inset-x-0 top-3 z-30 text-center text-13 font-medium text-[#A78BFA] motion-safe:animate-[reveal-field_280ms_cubic-bezier(0.16,1,0.3,1)_both]">
          {HIT_COPY.first}
        </p>
      ) : null}
    </>
  );
}

/** What the clip says under the card, from the match alone. */
function clipText(match: ScanMatch, hit: Hit, first: boolean) {
  return {
    player: match.playerName,
    set: [match.yearLabel, setWithInsert(match)].filter(Boolean).join(" "),
    tag: hitLabel(hit, match),
    first: first ? HIT_COPY.first : null,
  };
}

const fontOf = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `${value}, ${fallback}` : fallback;
};

type ReplayStatus = "playing" | "idle" | "recording" | "ready" | "saved" | "failed";

/**
 * The hit, played again full screen: tap the card on the result sheet to show a friend. The same
 * 9:16 picture is what "Share this hit" saves: 4 seconds, the real card, the Slabhold logo.
 * `mode`: "replay" (opened by a tap), "share" (records at once). Never opened on its own.
 * `onPlayed`: the effect was shown to its end (or, with Reduce Motion, its still).
 */
export function HitReplay({
  hit,
  match,
  photo,
  first = false,
  mode,
  onPlayed,
  onClose,
}: {
  hit: Hit;
  match: ScanMatch;
  photo: string;
  first?: boolean;
  mode: "replay" | "share";
  onPlayed?: () => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const title = useId();
  const [status, setStatus] = useState<ReplayStatus>(mode === "share" ? "recording" : "playing");
  // Each play (and each recording) is one run of the stage.
  const [run, setRun] = useState({ id: 0, record: mode === "share" });
  const clip = useRef<File | null>(null);
  const close = useRef(onClose);
  const shown = useRef(onPlayed);
  useEffect(() => {
    close.current = onClose;
    shown.current = onPlayed;
  });
  const canShare = useSyncExternalStore(
    () => () => {},
    clipSupported,
    () => false,
  );

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Only the replay closes: the card's sheet behind it stays open.
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let live = true;
    let frame = 0;
    let dispose: (() => void) | null = null;
    const plan = hitPlan(hit, { first });
    const still = reducedMotion();
    const logo = loadImage("/logo.svg").catch(() => null);

    Promise.all([import("@/lib/scan/hit-fx/clip"), loadImage(photo), logo, document.fonts?.ready])
      .then(([fx, image, mark]) => {
        if (!live) return;
        const stage = fx.createHitStage({
          canvas: surface,
          photo: image,
          logo: mark,
          hit,
          plan,
          text: clipText(match, hit, first),
          sans: fontOf("--font-geist-sans", "system-ui, sans-serif"),
          mono: fontOf("--font-geist-mono", "ui-monospace, monospace"),
          still,
        });
        dispose = stage.dispose;
        const endMs = fx.CLIP.leadMs + plan.durationMs;
        // Reduce Motion: no effect and no shake. The card as it ends up, and one buzz.
        if (still && !run.record) {
          stage.draw(fx.CLIP.ms);
          haptic(plan.impactHaptic);
          setStatus("idle");
          shown.current?.();
          return;
        }
        stage.draw(0);
        const recording = run.record ? fx.recordClip(surface) : null;
        const zero = performance.now();
        let last = -1;
        const tick = (now: number) => {
          if (!live) return;
          const ms = now - zero;
          stage.draw(still ? fx.CLIP.ms : ms);
          if (!still) {
            const at = ms - fx.CLIP.leadMs;
            for (const beat of plan.buildHaptics) if (last < beat.atMs && at >= beat.atMs) haptic(beat.moment);
            if (last < plan.impactMs && at >= plan.impactMs) haptic(plan.impactHaptic);
            last = at;
          }
          if (recording ? ms >= fx.CLIP.ms + 120 : ms >= endMs + 600) {
            shown.current?.();
            if (!recording) {
              setStatus("idle");
              return;
            }
            recording
              .stop()
              .then(async (file) => {
                if (!live) return;
                clip.current = file;
                const saved = await fx.saveClip(file);
                if (live) setStatus(saved === "needs-tap" ? "ready" : saved === "cancelled" ? "idle" : "saved");
              })
              .catch(() => live && setStatus("failed"));
            return;
          }
          frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
      })
      .catch(() => {
        // No WebGL here, or the photo wouldn't load: nothing to replay.
        if (live) close.current();
      });

    return () => {
      live = false;
      window.cancelAnimationFrame(frame);
      dispose?.();
    };
    // One run per play: the card and the hit don't change while the replay is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const busy = status === "recording";
  const play = (record: boolean) => {
    if (busy) return;
    clip.current = null;
    setStatus(record ? "recording" : "playing");
    setRun((prev) => ({ id: prev.id + 1, record }));
  };
  /** "Save clip": the share sheet wanted a fresh tap. */
  const saveNow = async () => {
    const file = clip.current;
    if (!file) return;
    const fx = await import("@/lib/scan/hit-fx/clip");
    const saved = await fx.saveClip(file);
    setStatus(saved === "needs-tap" ? "ready" : saved === "cancelled" ? "idle" : "saved");
  };

  const quiet = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A78BFA] disabled:opacity-50";
  const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A78BFA] disabled:opacity-60";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title}
      data-hit-replay={mode}
      className="fixed inset-0 z-[120] flex flex-col bg-[#09090B] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] motion-safe:animate-[add-fade_160ms_ease-out_both]"
    >
      <h2 id={title} className="sr-only">
        {`${HIT_COPY.effect[hit.effect]}: ${match.playerName}`}
      </h2>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvas}
          width={720}
          height={1280}
          role="img"
          aria-label={`${match.playerName}, ${hitLabel(hit, match)}`}
          onClick={() => play(false)}
          className="aspect-[9/16] max-h-full max-w-full"
        />
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label={HIT_COPY.close}
          className="absolute top-2 right-2 grid size-11 place-items-center rounded-full bg-black/40 text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A78BFA]"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-[4.5rem] shrink-0 items-center justify-center gap-2 px-5">
          <p role="status" className={`text-sm text-zinc-300 ${busy || status === "saved" || status === "failed" ? "" : "sr-only"}`}>
            {busy ? HIT_COPY.saving : status === "saved" ? HIT_COPY.saved : status === "failed" ? HIT_COPY.shareFailed : ""}
          </p>
          {busy ? null : (
            <>
              {status === "ready" ? (
                <button type="button" onClick={() => void saveNow()} className={primary}>
                  <Share2 className="size-4" aria-hidden />
                  {HIT_COPY.saveClip}
                </button>
              ) : canShare && status !== "saved" ? (
                <button type="button" onClick={() => play(true)} className={primary}>
                  <Share2 className="size-4" aria-hidden />
                  {HIT_COPY.share}
                </button>
              ) : null}
              <button type="button" onClick={() => play(false)} className={quiet}>
                {HIT_COPY.replay}
              </button>
            </>
          )}
      </div>
    </div>
  );
}

/**
 * On the card's sheet once a hit has played: why it is a hit, and "Share this hit". The card's
 * photo beside it replays the effect on a tap.
 */
export function HitRow({
  hit,
  match,
  onShare,
  onReplay,
  glow = false,
}: {
  hit: Hit;
  match: ScanMatch;
  onShare: () => void;
  onReplay: () => void;
  /** The hit's sale came in after the sheet was up: the row lights purple once, then rests. */
  glow?: boolean;
}) {
  const canShare = useSyncExternalStore(
    () => () => {},
    clipSupported,
    () => false,
  );
  return (
    <div
      data-hit-row={hit.effect}
      data-hit-glow={glow ? "" : undefined}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-zinc-200 pr-1 pl-4 dark:border-white/10 ${glow ? "motion-safe:animate-[hit-row-glow_1100ms_cubic-bezier(0.16,1,0.3,1)_both]" : ""}`}
    >
      <p className="min-w-0 truncate font-mono text-13 font-medium text-violet-700 tabular-nums dark:text-[#A78BFA]">{hitLabel(hit, match)}</p>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-violet-600 dark:text-[#A78BFA]"
        >
          {HIT_COPY.replay}
        </button>
        {canShare ? (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-violet-600 dark:text-[#A78BFA]"
          >
            <Share2 className="size-4" aria-hidden />
            {HIT_COPY.share}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** "Hit streak 3": hits scanned back-to-back this session. Nothing until the second in a row. */
export function HitStreakBadge({ className = "" }: { className?: string }) {
  const count = useSyncExternalStore(
    subscribeHits,
    () => streakShown(hitStreak()),
    () => null,
  );
  if (count == null) return null;
  return (
    <p
      role="status"
      data-hit-streak={count}
      className={`inline-flex shrink-0 items-baseline gap-2 text-13 font-medium text-violet-700 dark:text-[#A78BFA] ${className}`}
    >
      {HIT_COPY.streak}
      <span className="font-mono tabular-nums">{count}</span>
    </p>
  );
}

/** The "Hit reveals" switch in settings. On by default; kept on this phone. */
export function HitRevealsSetting() {
  const on = useSyncExternalStore(subscribeHits, hitRevealsOn, () => true);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor="hit-reveals" className="text-sm font-semibold">
          {HIT_COPY.setting}
        </label>
        <p id="hit-reveals-help" className="mt-1 text-sm text-zinc-500">
          {HIT_COPY.settingHelp}
        </p>
      </div>
      <label htmlFor="hit-reveals" className="relative mt-0.5 inline-flex shrink-0">
        <input
          id="hit-reveals"
          type="checkbox"
          role="switch"
          aria-checked={on}
          aria-describedby="hit-reveals-help"
          checked={on}
          onChange={(event) => setHitReveals(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-zinc-300 peer-checked:bg-violet-600 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--background)] dark:bg-white/20" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
        <span className="absolute -top-2.5 left-0 h-11 w-11" />
      </label>
    </div>
  );
}
