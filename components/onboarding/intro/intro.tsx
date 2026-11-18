"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { EASE, canAnimate, prefersReducedMotion } from "@/components/landing/showcase/motion";
import { INTRO_STEPS, markIntroSeen } from "@/lib/onboarding/intro";
import { Dust } from "./effects";
import { AlertsVisual, CollectionVisual, QuickCompVisual, SCREEN_FRAMES, SocialVisual, WelcomeVisual } from "./screens";

type Screen = { title: string; line: string; button: string; Visual: ComponentType<{ motion: boolean }> };

export const INTRO_SCREENS: readonly Screen[] = [
  { title: "Welcome to Slabhold", line: "Your cards, your comps and the collectors who get it", button: "Continue", Visual: WelcomeVisual },
  { title: "Comp any card in seconds", line: "Recent sold prices, the median and the range", button: "Continue", Visual: QuickCompVisual },
  { title: "Watch your collection's value", line: "Every card you add counts toward one value, drawn over time", button: "Continue", Visual: CollectionVisual },
  { title: "Follow collectors, earn badges", line: "See their pickups and climb from Bronze to Legendary", button: "Continue", Visual: SocialVisual },
  { title: "Know when it matters", line: "Follows, likes, replies and messages as they happen", button: "Turn on alerts", Visual: AlertsVisual },
];

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const SWIPE_PX = 56;
/** Reduced motion swaps screens with a short fade and nothing else. */
const SWAP_MS = 120;

/**
 * Five screens a new account sees once, before "What do you collect?". Skip
 * (top right, in the DOM from the first frame) and Escape end it in one tap;
 * Continue, Back and a swipe move between screens. Every way out marks it
 * seen right away. On the web, Turn on alerts ends it like Maybe later and
 * the existing push soft-ask stays in charge.
 */
export default function OnboardingIntro({ userId, onEnd }: { userId: string; onEnd: () => void }) {
  const [step, setStep] = useState(0);
  const [motion] = useState(() => !prefersReducedMotion());
  const titleId = useId();
  const lineId = useId();
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fit = useRef<HTMLDivElement>(null);
  const lastFrame = useRef<DOMRect | null>(null);
  const ended = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const screen = INTRO_SCREENS[step];
  const shape = SCREEN_FRAMES[step];

  function end(handOff: boolean) {
    if (ended.current) return;
    ended.current = true;
    markIntroSeen(userId);
    const node = root.current;
    // The hand-off: the intro settles back into the setup sheet behind it. Skip never waits.
    if (!handOff || !motion || !canAnimate(node)) {
      onEnd();
      return;
    }
    const exit = node.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.98)" },
      ],
      { duration: 240, easing: EASE, fill: "forwards" },
    );
    exit.onfinish = () => onEnd();
    exit.oncancel = () => onEnd();
  }

  function go(next: number) {
    if (next < 0 || next >= INTRO_STEPS) return;
    lastFrame.current = frame.current?.getBoundingClientRect() ?? null;
    setStep(next);
  }

  function primary() {
    if (step < INTRO_STEPS - 1) go(step + 1);
    // iOS shell: ask for the native notification permission here, then end.
    else end(true);
  }

  // Focus starts on the main button and stays in the dialog.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const docEl = document.documentElement;
    const overflow = docEl.style.overflow;
    docEl.style.overflow = "hidden";
    main.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        end(false);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : index === items.length - 1 ? 0 : index + 1;
      event.preventDefault();
      items[next]?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      docEl.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // Mount only: end() reads refs and stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The morph: the central object's frame grows from the last screen's shape
  // into this one (FLIP, transform only) and the new content settles in.
  useLayoutEffect(() => {
    const node = frame.current;
    const from = lastFrame.current;
    lastFrame.current = null;
    if (!node || !from || !canAnimate(node)) return;
    if (!motion) {
      for (const layer of [stage.current, document.getElementById(titleId)?.parentElement]) {
        layer?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP_MS, easing: EASE });
      }
      return;
    }
    const to = node.getBoundingClientRect();
    if (to.width > 0 && to.height > 0) {
      node.animate(
        [
          {
            transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            opacity: 1,
          },
          { transform: "translate(0, 0) scale(1, 1)", opacity: shape.visible ? 1 : 0 },
        ],
        { duration: 480, easing: EASE },
      );
    }
    content.current?.animate(
      [
        { opacity: 0, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 360, delay: 160, easing: EASE, fill: "backwards" },
    );
    document.getElementById(titleId)?.parentElement?.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 320, delay: 120, easing: EASE, fill: "backwards" },
    );
  }, [step, motion, shape.visible, titleId]);

  // Short phones: the visual scales down to fit its space, never scrolls.
  useLayoutEffect(() => {
    const box = stage.current;
    const inner = fit.current;
    if (!box || !inner || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const need = inner.offsetHeight;
      const room = box.clientHeight;
      const scale = need > 0 && room > 0 ? Math.min(1, room / need) : 1;
      inner.style.transform = scale < 1 ? `scale(${scale})` : "";
    };
    const observer = new ResizeObserver(apply);
    observer.observe(box);
    observer.observe(inner);
    apply();
    return () => observer.disconnect();
  }, [step]);

  const Visual = screen.Visual;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Slabhold intro"
      aria-describedby={lineId}
      data-onboarding-intro=""
      data-always-dark=""
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
        go(dx < 0 ? step + 1 : step - 1);
      }}
      onPointerCancel={() => (swipe.current = null)}
      className="fixed inset-0 z-50 flex touch-pan-y flex-col overflow-hidden bg-[linear-gradient(180deg,#09090B_0%,#09090B_30%,#1E1036_100%)] text-zinc-100"
    >
      {motion ? <Dust /> : null}

      <header className="relative mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="justify-self-start">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              aria-label="Back"
              className="grid h-11 w-11 place-items-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
            >
              <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
            </button>
          ) : (
            <span aria-hidden className="block h-11 w-11" />
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`Step ${step + 1} of ${INTRO_STEPS}`}
          aria-valuemin={1}
          aria-valuemax={INTRO_STEPS}
          aria-valuenow={step + 1}
          className="flex items-center gap-1.5"
        >
          {Array.from({ length: INTRO_STEPS }, (_, index) => (
            <span
              key={index}
              data-dot={index === step ? "current" : undefined}
              className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                index === step ? "w-6 bg-[#7C3AED]" : index < step ? "w-1.5 bg-[#A78BFA]/60" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => end(false)}
          className="min-h-11 justify-self-end rounded-full px-3 text-15 font-medium text-zinc-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
        >
          Skip
        </button>
      </header>

      <div ref={stage} className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 items-center justify-center px-4 py-4">
        <div ref={fit} className="relative flex w-full origin-center flex-col items-center">
          <div className="relative grid w-full place-items-center">
            <div
              ref={frame}
              aria-hidden
              className={`absolute border border-white/10 bg-white/[0.04] ${shape.visible ? "" : "opacity-0"}`}
              style={{ width: `min(${shape.width}px, 100%)`, height: shape.height, borderRadius: shape.radius }}
            />
            <div
              ref={content}
              key={step}
              className="relative flex w-full min-w-0 justify-center"
              style={shape.visible ? { maxWidth: shape.width, height: shape.height } : undefined}
            >
              <Visual motion={motion} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-lg px-6 text-center" aria-live="polite">
        <h2 id={titleId} className="text-[1.75rem] leading-9 font-semibold tracking-[-0.02em] text-white">
          {screen.title}
        </h2>
        <p id={lineId} className="mx-auto mt-2 min-h-12 max-w-xs text-16 leading-6 text-zinc-400">
          {screen.line}
        </p>
      </div>

      <footer className="relative mx-auto w-full max-w-lg px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          ref={main}
          type="button"
          onClick={primary}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#7C3AED] text-17 font-semibold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] focus-visible:outline-none"
        >
          {screen.button}
        </button>
        {step === INTRO_STEPS - 1 ? (
          <button
            type="button"
            onClick={() => end(true)}
            className="mt-1 flex min-h-11 w-full items-center justify-center rounded-full text-15 font-medium text-zinc-400 hover:text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
          >
            Maybe later
          </button>
        ) : (
          <span aria-hidden className="mt-1 block h-11" />
        )}
      </footer>
    </div>
  );
}
