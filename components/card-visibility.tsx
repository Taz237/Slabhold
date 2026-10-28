"use client";

import { useState } from "react";
import { Globe, Lock } from "lucide-react";

/** What updateCard returns. The switch only needs the save promise. */
export type VisibilitySave = { saved: Promise<unknown> };

type SaveState = "idle" | "saving" | "saved" | "failed";

export function visibilityCopy(isPublic: boolean): { label: string; detail: string } {
  return isPublic
    ? { label: "Public on profile", detail: "Anyone can see it on your profile." }
    : { label: "Private", detail: "Only you can see it." };
}

function useVisibilitySave(onChange: (next: boolean) => VisibilitySave | void) {
  const [state, setState] = useState<SaveState>("idle");
  function toggle(next: boolean) {
    const result = onChange(next);
    if (!result) {
      setState("saved");
      return;
    }
    setState("saving");
    result.saved.then(
      () => setState("saved"),
      () => setState("failed"),
    );
  }
  return { state, toggle };
}

/** Card page switch. Saves on tap; the card's own isPublic drives what it shows. */
export function CardVisibilitySwitch({
  isPublic,
  onChange,
}: {
  isPublic: boolean;
  onChange: (next: boolean) => VisibilitySave | void;
}) {
  const { state, toggle } = useVisibilitySave(onChange);
  const copy = visibilityCopy(isPublic);
  const Icon = isPublic ? Globe : Lock;
  const status =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "failed" ? "Couldn't save. Tap to try again." : "";
  return (
    <div data-slot="card-visibility">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Public on profile"
        onClick={() => toggle(!isPublic)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-left transition-colors duration-150 hover:border-violet-400/60 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.03]"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
            isPublic
              ? "bg-violet-500/15 text-violet-700 dark:text-[#A78BFA]"
              : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
          }`}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{copy.label}</span>
          <span className="block truncate text-xs text-zinc-500">{copy.detail}</span>
        </span>
        <span
          aria-hidden
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none ${
            isPublic ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none ${
              isPublic ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </button>
      <p
        aria-live="polite"
        className={`mt-1 min-h-4 px-1 text-xs ${state === "failed" ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}
      >
        {status}
      </p>
    </div>
  );
}

/** Small lock over a Collection tile's art, bottom right. Sits outside the tile link so links don't nest. */
export function TileVisibilityButton({
  isPublic,
  playerName,
  onChange,
  raised = false,
}: {
  isPublic: boolean;
  playerName: string;
  onChange: (next: boolean) => VisibilitySave | void;
  /** Sit above the Add photo hint when it shows. */
  raised?: boolean;
}) {
  const { state, toggle } = useVisibilitySave(onChange);
  const Icon = isPublic ? Globe : Lock;
  const label = `${playerName}: ${isPublic ? "public on profile" : "private"}${state === "failed" ? ", couldn't save" : ""}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 p-1">
      <div className="relative aspect-[3/5] w-full">
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label={label}
          title={isPublic ? "Public on profile" : "Private"}
          onClick={(event) => {
            event.stopPropagation();
            toggle(!isPublic);
          }}
          className={`group/vis pointer-events-auto absolute right-0 grid h-11 w-11 ${raised ? "bottom-11" : "bottom-0"} place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-600`}
        >
          {/* The button is 44px. The chip stays small. */}
          <span
            className={`grid h-7 w-7 place-items-center rounded-full backdrop-blur-sm transition group-hover/vis:bg-black/60 ${
              state === "failed" ? "bg-rose-600/80 text-white" : isPublic ? "bg-violet-600/85 text-white" : "bg-black/45 text-white/90"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      </div>
    </div>
  );
}
