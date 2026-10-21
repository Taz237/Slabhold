"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  checklistDismissKey,
  checklistNewUserKey,
  followStepLabel,
  storedNewUserFlag,
  type ChecklistState,
  type ChecklistStepId,
} from "@/lib/social/get-started";

const STEPS: { id: ChecklistStepId; label: string }[] = [
  { id: "follow", label: "Follow 3 collectors" },
  { id: "card", label: "Add your first card" },
  { id: "profile", label: "Add a photo or bio" },
];

const stepClass =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-1 text-left text-[15px] hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:hover:bg-white/10";

function readDismissed(userId: string | null) {
  if (!userId || typeof window === "undefined") return false;
  return window.localStorage.getItem(checklistDismissKey(userId)) === "1";
}

export function useGetStartedDismissed(userId: string | null) {
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));

  const dismiss = useCallback(() => {
    if (!userId) return;
    window.localStorage.setItem(checklistDismissKey(userId), "1");
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
    const existing =
      userId && typeof window !== "undefined"
        ? storedNewUserFlag(window.localStorage.getItem(checklistNewUserKey(userId)))
        : null;
    setRecord({ userId, value: existing });
  } else if (userId && record.value === null && wasNewOnLoad !== null) {
    setRecord({ userId, value: wasNewOnLoad });
  }

  useEffect(() => {
    if (!userId || wasNewOnLoad === null || typeof window === "undefined") return;
    const key = checklistNewUserKey(userId);
    if (storedNewUserFlag(window.localStorage.getItem(key)) !== null) return;
    window.localStorage.setItem(key, wasNewOnLoad ? "1" : "0");
  }, [userId, wasNewOnLoad]);

  return record.userId === userId ? record.value : null;
}

export function GetStartedCard({
  state,
  followingCount,
  onDismiss,
  onFollow,
}: {
  state: ChecklistState;
  followingCount: number;
  onDismiss: () => void;
  onFollow: () => void;
}) {
  if (!state.visible) return null;
  const done = new Map(state.steps.map((step) => [step.id, step.done]));

  return (
    <section data-get-started className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
      <div className="relative rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="pr-12 text-sm font-semibold">Get started</p>
        <p className="mt-0.5 pr-12 text-[15px] leading-5 text-zinc-600 dark:text-zinc-300">
          Follow collectors, add a card, and set up your profile.
        </p>
        <ul className="mt-1">
          {STEPS.map((step) => {
            const complete = done.get(step.id) === true;
            const inner = (
              <>
                <StepMark done={complete} />
                <span className={complete ? "text-zinc-400" : "font-medium"}>
                  {step.id === "follow" ? followStepLabel(followingCount) : step.label}
                </span>
              </>
            );
            if (step.id === "follow") {
              return (
                <li key={step.id}>
                  <button type="button" onClick={onFollow} className={stepClass}>
                    {inner}
                  </button>
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

function StepMark({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
        <Check className="h-3 w-3" aria-hidden />
        <span className="sr-only">Done. </span>
      </span>
    );
  }
  return (
    <span className="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-white/20" />
  );
}
