"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmSheet, type ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { saveScan, saveScanMatch } from "@/lib/capture";
import { newScanId, scanAddPath, scanHandoffFrom } from "@/lib/scan/handoff";
import type { ScanMatch } from "@/lib/scan/match";
import { PREVIEW_NUMBERED, PREVIEW_PHOTO, PREVIEW_RAW, PREVIEW_SLAB } from "@/lib/scan/preview-fixtures";

export type PreviewKind = "slab" | "raw" | "numbered" | "matching" | "none" | "offline";

const STATES: Record<PreviewKind, ConfirmSheetState> = {
  slab: { kind: "ready", matches: [PREVIEW_SLAB] },
  raw: { kind: "ready", matches: PREVIEW_RAW },
  numbered: { kind: "ready", matches: [PREVIEW_NUMBERED, ...PREVIEW_RAW.slice(1)] },
  matching: { kind: "matching" },
  none: { kind: "none" },
  offline: { kind: "none", offline: true },
};

const LABELS: Record<PreviewKind, string> = {
  slab: "Slab",
  raw: "Raw, parallel open",
  numbered: "Numbered",
  matching: "Matching",
  none: "No match",
  offline: "Offline",
};

/**
 * The confirm sheet over a made-up scan. "Yes, that's it" runs the real
 * handoff into Add card, so the whole path can be tried on a preview build.
 */
export function ScanSheetPreview({ kind }: { kind: PreviewKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function confirm(match: ScanMatch, options: { save: boolean }) {
    const id = newScanId();
    saveScan(PREVIEW_PHOTO);
    saveScanMatch(scanHandoffFrom(match, id, { autoSave: options.save }));
    router.push(scanAddPath(id));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scan preview</h1>
      <p className="text-sm text-zinc-500">Made-up scans, for review only.</p>
      <nav aria-label="Sheet states" className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as PreviewKind[]).map((item) => (
          <Link
            key={item}
            href={`/scan/preview?state=${item}`}
            aria-current={item === kind ? "page" : undefined}
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center rounded-full border border-zinc-200 px-4 text-sm font-medium aria-[current=page]:border-violet-600 aria-[current=page]:text-violet-700 dark:border-white/10 dark:aria-[current=page]:text-[#A78BFA]"
          >
            {LABELS[item]}
          </Link>
        ))}
      </nav>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white"
        >
          Open the sheet
        </button>
      ) : null}
      {open ? (
        <ConfirmSheet
          key={kind}
          photo={PREVIEW_PHOTO}
          state={STATES[kind]}
          onConfirm={confirm}
          onStepByStep={() => {
            saveScan(PREVIEW_PHOTO);
            router.push("/cards/new");
          }}
          onRetake={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
