"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Check, ChevronRight, UserPlus, UserRound, X } from "lucide-react";
import type { FirstRunPerson } from "@/components/first-run/first-run-steps";
import { trackEvent } from "@/lib/analytics";
import { lazyPart } from "@/lib/ui/lazy-part";
import {
  checklistDismissKey,
  checklistNewUserKey,
  followStepLabel,
  storedNewUserFlag,
  type ChecklistState,
  type ChecklistStepId,
} from "@/lib/social/get-started";
import {
  currentFirstRunStep,
  FIRST_RUN_EVENTS,
  FIRST_RUN_ORDER,
  firstRunEventsFor,
  trackFirstRunOnce,
  type FirstRunEvent,
} from "@/lib/social/first-run";

const STEPS: { id: ChecklistStepId; label: string; action: string; icon: ReactNode }[] = [
  { id: "card", label: "Add your first card", action: "Add card", icon: <Camera {...iconProps()} /> },
  { id: "follow", label: "Follow 3 collectors", action: "Find", icon: <UserPlus {...iconProps()} /> },
  { id: "profile", label: "Add a photo or bio", action: "Edit", icon: <UserRound {...iconProps()} /> },
];

function iconProps() {
  return { className: "h-4 w-4", strokeWidth: 1.5, "aria-hidden": true } as const;
}

/** The one easing for this card. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Rows sit 8px into the card's 16px padding, so their 8px corners nest inside its 16px ones. */
const rowClass = "-mx-2 flex min-h-14 w-[calc(100%+16px)] items-center gap-3 rounded-lg px-2 text-left text-15 leading-5";
const stepClass = `${rowClass} transition-colors duration-150 ${EASE} hover:bg-zinc-950/[0.03] focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none motion-reduce:transition-none dark:hover:bg-white/[0.04]`;

/** How long "You're set" stays before it fades and Get started is put away. */
const DONE_HOLD_MS = 2400;
const DONE_FADE_MS = 320;

/** Three people to follow, with Follow all. Its own chunk: only first-run viewers fetch it. */
const FirstRunPeople = lazyPart(
  () => import("@/components/first-run/first-run-steps").then((mod) => mod.FirstRunPeople),
  FirstRunPeopleSkeleton,
  { name: "first-run-people" },
);

const dismissedForSession = new Set<string>();

function readDismissed(userId: string | null) {
  if (!userId || typeof window === "undefined") return false;
  if (dismissedForSession.has(userId)) return true;
  try {
    return window.localStorage.getItem(checklistDismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function useGetStartedDismissed(userId: string | null) {
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));

  const dismiss = useCallback(() => {
    if (!userId) return;
    try {
      window.localStorage.setItem(checklistDismissKey(userId), "1");
    } catch {
      dismissedForSession.add(userId);
    }
    setDismissed(true);
  }, [userId]);

  return { dismissed, dismiss };
}

/**
 * Saves the first ready feed load. Later steps must not clear it, or the
 * checklist would vanish as soon as they add a card or follow someone.
 */
export function useRememberNewUser(userId: string | null, wasNewOnLoad: boolean | null) {
  const [record, setRecord] = useState<{ userId: string | null; value: boolean | null }>({
    userId: null,
    value: null,
  });

  if (record.userId !== userId) {
    let existing: boolean | null = null;
    if (userId && typeof window !== "undefined") {
      try {
        existing = storedNewUserFlag(window.localStorage.getItem(checklistNewUserKey(userId)));
      } catch {
        existing = null;
      }
    }
    setRecord({ userId, value: existing });
  } else if (userId && record.value === null && wasNewOnLoad !== null) {
    setRecord({ userId, value: wasNewOnLoad });
  }

  useEffect(() => {
    if (!userId || wasNewOnLoad === null || typeof window === "undefined") return;
    const key = checklistNewUserKey(userId);
    try {
      if (storedNewUserFlag(window.localStorage.getItem(key)) !== null) return;
      window.localStorage.setItem(key, wasNewOnLoad ? "1" : "0");
    } catch {
      // The in-memory flag still covers this visit.
    }
  }, [userId, wasNewOnLoad]);

  return record.userId === userId ? record.value : null;
}

export function GetStartedCard({
  state,
  followingCount,
  onDismiss,
  onFollow,
  userId = null,
  people = [],
  live = true,
}: {
  state: ChecklistState;
  followingCount: number;
  onDismiss: () => void;
  onFollow: () => void;
  /** For analytics, deduped per user on this device. */
  userId?: string | null;
  /** Up to 3 collectors to follow right here. Fewer than 3 keeps the scroll to the rail. */
  people?: FirstRunPerson[];
  /**
   * False while the server's first screen is drawn: the hint script may still
   * hide it, so nothing is tracked and nothing finishes until the hand-over.
   */
  live?: boolean;
}) {
  useEffect(() => {
    if (!state.visible || typeof window === "undefined") return;
    if (window.location.hash !== "#get-started") return;
    document.getElementById("get-started")?.scrollIntoView({ block: "start" });
  }, [state.visible]);

  // The first three stay put, so following one says "Following" in place.
  const [shownPeople, setShownPeople] = useState(people);
  if (shownPeople.length < 3 && people.length >= 3) setShownPeople(people.slice(0, 3));
  const inlinePeople = shownPeople.length >= 3 ? shownPeople.slice(0, 3) : [];

  useEffect(() => {
    if (state.visible && inlinePeople.length > 0) FirstRunPeople.warm();
  }, [state.visible, inlinePeople.length]);

  useFirstRunEvents(userId, state, live);

  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!live || !state.complete) return;
    const fade = window.setTimeout(() => setLeaving(true), DONE_HOLD_MS);
    const done = window.setTimeout(onDismiss, DONE_HOLD_MS + DONE_FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [live, state.complete, onDismiss]);

  if (!state.visible) return null;
  const done = new Map(state.steps.map((step) => [step.id, step.done]));
  const doneCount = FIRST_RUN_ORDER.filter((id) => done.get(id) === true).length;
  const current = currentFirstRunStep(state.steps);
  const total = FIRST_RUN_ORDER.length;

  return (
    <section
      id="get-started"
      data-get-started
      aria-labelledby="get-started-title"
      className={`scroll-mt-24 border-b border-zinc-950/[0.08] px-4 py-3 transition-opacity duration-300 ${EASE} motion-reduce:transition-none dark:border-white/[0.08] ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <div className="relative rounded-2xl border border-zinc-950/[0.08] bg-white p-4 motion-safe:animate-[first-run-in_360ms_cubic-bezier(0.22,1,0.36,1)_both] dark:border-white/[0.08] dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={() => {
            if (live) sendFirstRunEvent(FIRST_RUN_EVENTS.dismissed, userId);
            onDismiss();
          }}
          aria-label="Dismiss Get started"
          className={`absolute top-1 right-1 grid h-11 min-h-11 w-11 place-items-center rounded-lg text-zinc-500 transition-colors duration-150 ${EASE} hover:bg-zinc-950/[0.04] hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none motion-reduce:transition-none dark:hover:bg-white/[0.06] dark:hover:text-zinc-100`}
        >
          <X {...iconProps()} />
        </button>
        <h2 id="get-started-title" className="pr-10 text-17 leading-6 font-semibold">
          {state.complete ? "You're set" : "Set up your collection"}
        </h2>
        <p className="mt-1 pr-10 text-15 leading-5 text-zinc-600 dark:text-zinc-400">
          {state.complete
            ? "Your cards and the collectors you follow now fill Home."
            : "Show your cards, follow collectors, and see what your cards sell for."}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Get started progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
            className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-950/[0.06] dark:bg-white/[0.08]"
          >
            <div
              className={`h-full origin-left rounded-full bg-[#7C3AED] transition-transform duration-[400ms] ${EASE} motion-reduce:transition-none`}
              style={{ transform: `scaleX(${doneCount / total})` }}
            />
          </div>
          <p className="text-13 leading-5 text-zinc-500 tabular-nums">
            {doneCount} of {total}
          </p>
        </div>
        <ul className="mt-2">
          {STEPS.map((step) => {
            const complete = done.get(step.id) === true;
            const isCurrent = step.id === current;
            const label = step.id === "follow" ? followStepLabel(followingCount) : step.label;
            const inner = (
              <>
                <StepMark done={complete} current={isCurrent} icon={step.icon} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block tabular-nums transition-colors duration-150 ${EASE} motion-reduce:transition-none ${complete ? "text-zinc-500" : "font-medium"}`}
                  >
                    {label}
                  </span>
                  {step.id === "profile" && !complete ? (
                    <span className="block text-13 leading-5 text-zinc-500">Optional</span>
                  ) : null}
                </span>
                {complete ? null : <StepAction current={isCurrent} label={step.action} />}
              </>
            );
            if (step.id === "follow") {
              const inline = !complete && inlinePeople.length > 0;
              return (
                <li key={step.id}>
                  {inline ? (
                    <div className={rowClass}>
                      <StepMark done={false} current={isCurrent} icon={step.icon} />
                      <span className="min-w-0 flex-1 font-medium tabular-nums">{label}</span>
                    </div>
                  ) : (
                    <button type="button" onClick={onFollow} className={stepClass}>
                      {inner}
                    </button>
                  )}
                  {inline ? <FirstRunPeople people={inlinePeople} current={isCurrent} /> : null}
                </li>
              );
            }
            const href = step.id === "card" ? "/cards/new" : "/profile?edit=1";
            return (
              <li key={step.id}>
                <Link href={href} className={stepClass}>
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** The current step's action is the only purple one. Later steps get a quiet chevron. */
function StepAction({ current, label }: { current: boolean; label: string }) {
  if (!current) return <ChevronRight {...iconProps()} className="h-4 w-4 shrink-0 text-zinc-400" />;
  return (
    <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-violet-600 px-3 text-13 font-medium text-white">
      {label}
    </span>
  );
}

/**
 * A small slab: a label band over a window that holds the step's icon. A done
 * step's window cross-fades to a check.
 */
function StepMark({ done, current, icon }: { done: boolean; current: boolean; icon: ReactNode }) {
  const status = <span className="sr-only">{done ? "done" : "not done"}. </span>;
  const fade = `transition-opacity duration-150 ${EASE} motion-reduce:transition-none`;
  return (
    <span
      className={`relative flex h-10 w-8 shrink-0 flex-col overflow-hidden rounded-md border ${
        current
          ? "border-[#7C3AED]/40 text-[#7C3AED] dark:text-[#A78BFA]"
          : "border-zinc-950/[0.1] text-zinc-500 dark:border-white/[0.1]"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 shrink-0 border-b ${
          current ? "border-[#7C3AED]/30 bg-[#7C3AED]/10" : "border-zinc-950/[0.08] bg-zinc-950/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]"
        }`}
      />
      <span className="relative grid flex-1 place-items-center">
        <span className={`absolute inset-0 grid place-items-center ${fade} ${done ? "opacity-0" : "opacity-100"}`}>
          {icon}
        </span>
        <span
          className={`absolute inset-0 grid place-items-center text-zinc-900 dark:text-zinc-100 ${fade} ${done ? "opacity-100" : "opacity-0"}`}
        >
          <Check {...iconProps()} />
        </span>
      </span>
      {status}
    </span>
  );
}

/** Same box as the loaded list: a 44px header and three 56px rows, so nothing moves when it lands. */
function FirstRunPeopleSkeleton() {
  return (
    <div aria-hidden className="pb-2 pl-11">
      <div className="flex h-11 items-center">
        <span className="h-3 w-24 rounded bg-zinc-950/[0.06] dark:bg-white/[0.08]" />
      </div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-14 items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-full bg-zinc-950/[0.06] dark:bg-white/[0.08]" />
          <span className="h-3 w-28 rounded bg-zinc-950/[0.06] dark:bg-white/[0.08]" />
        </div>
      ))}
    </div>
  );
}

function sendFirstRunEvent(event: FirstRunEvent, userId: string | null) {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  trackFirstRunOnce(event, userId, { storage, send: (name) => trackEvent(name) });
}

/**
 * first_run_shown once the card is really on screen, then a step event when a
 * step flips to done while it stays mounted. A step already done on load
 * fires nothing. Each event goes at most once per user on this device.
 */
function useFirstRunEvents(userId: string | null, state: ChecklistState, live: boolean) {
  const seen = useRef<ChecklistState["steps"] | null>(null);
  useEffect(() => {
    if (!live || !state.visible || !userId) return;
    if (seen.current === null) sendFirstRunEvent(FIRST_RUN_EVENTS.shown, userId);
    for (const event of firstRunEventsFor(seen.current, state.steps)) sendFirstRunEvent(event, userId);
    seen.current = state.steps;
  }, [live, state.visible, state.steps, userId]);
}
