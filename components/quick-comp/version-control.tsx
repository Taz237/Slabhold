"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { SwatchDot } from "@/components/add-card/flow-ui";
import type { QuickVersion } from "@/lib/quick-comp/versions";
import { feedback, focusRing, sectionLabel, textMuted } from "./tokens";

const chip = `flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-13 font-medium whitespace-nowrap ${feedback} ${focusRing}`;
const chipOn = "bg-white text-zinc-950 ring-1 ring-violet-600/50 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-violet-400/50";
const chipOff = "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50";

export function versionLabel(version: QuickVersion): string {
  if (!version.serialRun) return version.name;
  return `${version.name} ${version.serialRun === 1 ? "1/1" : `/${version.serialRun}`}`;
}

/**
 * Base · Refractor · X-Fractor · … as one radiogroup that scrolls sideways.
 * The sold prices below are for the version picked here only, so Base is never a mix.
 * Arrow keys move and pick, like the grade row.
 */
export function VersionControl({
  versions,
  selected,
  onChange,
}: {
  versions: readonly QuickVersion[];
  /** Index into `versions`. */
  selected: number;
  onChange: (version: QuickVersion) => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the picked version in view: on open it may sit far down a long list.
  useEffect(() => {
    const node = refs.current[selected];
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected, versions.length]);

  if (versions.length < 2) return null;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + versions.length) % versions.length;
    refs.current[next]?.focus();
    onChange(versions[next]);
  }

  return (
    <div data-quick-comp-versions="">
      <p id={labelId} className={sectionLabel}>
        Version
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-2 flex gap-1 overflow-x-auto overscroll-x-contain rounded-xl bg-zinc-950/[0.04] p-1 [scrollbar-width:none] dark:bg-white/[0.04] [&::-webkit-scrollbar]:hidden"
      >
        {versions.map((version, index) => {
          const on = index === selected;
          return (
            <button
              key={version.name}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={versionLabel(version)}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(version)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              <SwatchDot name={version.name} size="sm" />
              <span>{version.name}</span>
              {version.serialRun ? (
                <span className={`font-mono text-xs tabular-nums ${on ? "" : textMuted}`}>{version.serialRun === 1 ? "1/1" : `/${version.serialRun}`}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
