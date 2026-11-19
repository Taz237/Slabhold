"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { haptic } from "@/lib/ios/haptics";
import { REVEAL_COPY, REVEAL_SWEEP_MS, type RevealFieldLine } from "@/lib/scan/reveal";

/** A real card's corner: about 3.5% of its width (and so 2.5% of its height). */
const corner = "[border-radius:3.5%/2.5%]";
const face = `absolute inset-0 overflow-hidden ${corner} ring-1 ring-white/10 [backface-visibility:hidden]`;

function Photo({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={192} height={269} decoding="async" draggable={false} className="h-full w-full object-cover" />;
}

/** A designed empty card, never a broken image. */
function EmptyFace({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="grid h-full w-full place-items-center bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-white/[0.08] dark:to-white/[0.03]">
      <span aria-hidden className="size-8 rounded-full bg-zinc-900/[0.06] dark:bg-white/10" />
    </div>
  );
}

/**
 * "reading": the card sits on the stage, floating a little, while a band of white light crosses it
 * again and again. "final": the match is in, one last brighter pass. "landing": the card turns on
 * its Y axis and glides to its slot on the sheet. "rest": it sits on its front.
 * Reduced motion: no light, no float, no turn. The card simply fades in.
 */
export type RevealMotion = "reading" | "final" | "landing" | "rest";

/** Where the landing card goes: an offset and a scale from where it sits on the stage. */
export type RevealLanding = { x: number; y: number; scale: number };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/** The band of light: white, about 40% of the card wide, tilted 22°, clipped to the card's face. */
function Sweep({ motion, onPass }: { motion: RevealMotion; onPass?: () => void }) {
  if (motion !== "reading" && motion !== "final") return null;
  const run =
    motion === "reading"
      ? "motion-safe:animate-[reveal-sweep_1400ms_cubic-bezier(0.4,0,0.6,1)_infinite]"
      : "motion-safe:animate-[reveal-sweep-final_520ms_cubic-bezier(0.4,0,0.6,1)_both]";
  return (
    <span
      aria-hidden
      data-glare={motion}
      onAnimationStart={onPass}
      onAnimationIteration={onPass}
      className={`pointer-events-none absolute -top-[30%] left-0 h-[160%] w-[42%] bg-gradient-to-r from-transparent ${motion === "final" ? "via-white/85" : "via-white/50"} to-transparent opacity-0 mix-blend-screen ${run}`}
    />
  );
}

/** The card's edge, seen only when it turns: card stock, a few px thick. */
function Edge({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-y-[1.5%] w-[3px] bg-gradient-to-b from-zinc-100 via-zinc-300 to-zinc-400 ${
        side === "left" ? "left-0 origin-left [transform:rotateY(90deg)]" : "right-0 origin-right [transform:rotateY(-90deg)]"
      }`}
    />
  );
}

/**
 * The scan reveal's card, made of the collector's own photos. Large, it stands on a studio stage:
 * it snaps in (with a light haptic), floats, and the light "reads" it, a soft purr with each pass.
 * With a back photo, the stage turns to the back for one pass. Small ("rest"), it is just the card.
 */
export function RevealSpinCard({
  photo,
  backPhoto = null,
  motion,
  size = "large",
  landing = null,
}: {
  photo: string | null;
  backPhoto?: string | null;
  motion: RevealMotion;
  size?: "large" | "small";
  /** Set for "landing": where the card glides to. */
  landing?: RevealLanding | null;
}) {
  const stage = size === "large";
  const reading = motion === "reading";
  // The stage turns to the back for one pass of the light, then home for good.
  const [turned, setTurned] = useState<"front" | "back">("front");
  // Once the match is in, the card faces front for its landing.
  const side = reading ? turned : "front";
  const passes = useRef(0);
  const turn = useRef<number | null>(null);

  // The cropped photo lands on the stage: one sharp, light tap. Not under reduced motion.
  useEffect(() => {
    if (!stage || !photo || motion !== "reading" || reducedMotion()) return;
    haptic("snap");
    // Once per photo: the motion it arrived with is all that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, stage]);

  useEffect(
    () => () => {
      if (turn.current != null) window.clearTimeout(turn.current);
    },
    [],
  );

  /** A pass of the light starts: the purr, and (with a back photo) the one look at the back. */
  function onPass() {
    haptic("sweep");
    if (!reading) return;
    passes.current += 1;
    const pass = passes.current;
    if (!backPhoto || (pass !== 2 && pass !== 3)) return;
    // Turn in the rest between passes: to the back after the second, home after the third.
    turn.current = window.setTimeout(() => setTurned(pass === 2 ? "back" : "front"), REVEAL_SWEEP_MS);
  }

  const width = stage ? "w-48" : "w-24";
  const landingNow = motion === "landing";
  const glide: CSSProperties | undefined =
    landingNow && landing ? ({ "--land-x": `${landing.x}px`, "--land-y": `${landing.y}px`, "--land-scale": String(landing.scale) } as CSSProperties) : undefined;
  return (
    <div
      className={`relative flex justify-center [perspective:900px] ${stage ? "min-h-0 flex-1 items-center py-8" : "pt-1 pb-5"}`}
      data-reveal="scan-card"
      data-stage={stage ? "" : undefined}
    >
      {stage ? (
        <span
          aria-hidden
          data-stage-light=""
          className={`reveal-stage-light pointer-events-none absolute inset-0 rounded-2xl ${landingNow ? "motion-safe:animate-[reveal-stage-out_400ms_ease-out_both]" : ""}`}
        />
      ) : null}
      <div
        key={photo ?? "none"}
        style={glide}
        className={`relative ${width} ${
          landingNow
            ? "z-10 origin-top-left motion-safe:animate-[reveal-glide_650ms_cubic-bezier(0.65,0,0.35,1)_both]"
            : "motion-safe:animate-[reveal-snap_220ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]"
        }`}
      >
        {stage ? <span aria-hidden className={`reveal-floor pointer-events-none absolute inset-x-[-12%] -bottom-5 h-8 ${landingNow ? "motion-safe:animate-[reveal-stage-out_200ms_ease-out_both]" : ""}`} /> : null}
        <div
          className={`[transform-style:preserve-3d] ${
            stage && motion !== "rest" ? "motion-safe:animate-[reveal-float_2600ms_ease-in-out_infinite_alternate]" : ""
          } ${motion === "final" || landingNow ? "[animation-play-state:paused]" : ""}`}
        >
          <div
            data-motion={motion}
            data-side={side}
            data-both-sides={backPhoto ? "" : undefined}
            className={`relative aspect-[5/7] w-full ${corner} [transform-style:preserve-3d] ${
              stage ? "shadow-[0_26px_38px_-14px_rgba(0,0,0,0.85),0_6px_14px_rgba(0,0,0,0.5)]" : "shadow-[0_18px_40px_rgba(9,9,11,0.35)]"
            } ${
              landingNow
                ? "motion-safe:animate-[reveal-land-turn_650ms_cubic-bezier(0.65,0,0.35,1)_both]"
                : `motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-in-out ${side === "back" ? "motion-safe:[transform:rotateY(180deg)]" : ""}`
            }`}
          >
            <div className={face}>
              {photo ? <Photo src={photo} alt={REVEAL_COPY.front} /> : <EmptyFace label={REVEAL_COPY.noPhoto} />}
              {stage ? <Sweep motion={motion} onPass={onPass} /> : null}
            </div>
            {backPhoto ? (
              <div aria-hidden className={`${face} [transform:rotateY(180deg)]`}>
                <Photo src={backPhoto} alt="" />
                {stage ? <Sweep motion={motion} /> : null}
              </div>
            ) : null}
            {stage ? (
              <>
                <Edge side="left" />
                <Edge side="right" />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What was read, under the card: the player, then the year and set, then the # and the serial. Each
 * fades in once, as soon as it is known. Only real reads: a field nothing read is simply not there,
 * and nothing is typed out for show. The space is held so the card never moves. Screen readers hear
 * each line as it arrives.
 */
export function RevealFields({ lines, leaving = false, onSkip }: { lines: readonly RevealFieldLine[]; leaving?: boolean; onSkip?: () => void }) {
  return (
    <div
      data-reveal="label"
      role="status"
      onClick={onSkip}
      className={`flex min-h-[4.75rem] flex-col items-center px-2 text-center ${leaving ? "motion-safe:animate-[reveal-stage-out_240ms_ease-out_both]" : ""}`}
    >
      {lines.map((line) => (
        <p
          key={line.field}
          data-line={line.field}
          className={`max-w-full break-words motion-safe:animate-[reveal-field_280ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both] ${
            line.field === "player"
              ? "text-17 leading-6 font-semibold"
              : line.field === "set"
                ? "mt-0.5 text-sm leading-5 text-zinc-600 dark:text-zinc-300"
                : "mt-1 font-mono text-13 leading-5 text-zinc-500 tabular-nums dark:text-zinc-400"
          }`}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
