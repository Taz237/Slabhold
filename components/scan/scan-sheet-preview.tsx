"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchDoor } from "@/components/add-card/search-door";
import { CompSheet } from "@/components/scan/comp-sheet";
import { ScanHub } from "@/components/scan/scan-hub";
import { ConfirmSheet, type ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { saveScan, saveScanMatch } from "@/lib/capture";
import { newScanId, scanAddPath, scanHandoffFrom } from "@/lib/scan/handoff";
import type { ScanMatch } from "@/lib/scan/match";
import {
  PREVIEW_NUMBERED,
  PREVIEW_PHOTO,
  PREVIEW_RAW,
  PREVIEW_SLAB,
  PREVIEW_FROM_SALES,
  PREVIEW_SOLDS,
  PREVIEW_SOLDS_PARALLEL,
  PREVIEW_RUN_ONLY,
  PREVIEW_SOLDS_RUN_ONLY,
  PREVIEW_SOLDS_LIMITED,
  PREVIEW_SOLDS_LOOKING,
  PREVIEW_SOLDS_NONE,
  previewCompLookup,
} from "@/lib/scan/preview-fixtures";

export type PreviewKind =
  | "slab"
  | "raw"
  | "numbered"
  | "matching"
  | "none"
  | "offline"
  | "comp"
  | "comp-raw"
  | "comp-none"
  | "comp-looking"
  | "comp-limited"
  | "slab-looking"
  | "from-sales"
  | "comp-from-sales"
  | "comp-run-only"
  | "hub"
  | "hub-comp"
  | "door";

const SCREENS = new Set<PreviewKind>(["hub", "hub-comp", "door"]);

const STATES: Record<Exclude<PreviewKind, "hub" | "hub-comp" | "door">, ConfirmSheetState> = {
  slab: { kind: "ready", matches: [PREVIEW_SLAB], solds: PREVIEW_SOLDS },
  "slab-looking": { kind: "ready", matches: [PREVIEW_SLAB], solds: PREVIEW_SOLDS_LOOKING },
  "from-sales": { kind: "ready", matches: [PREVIEW_FROM_SALES], solds: PREVIEW_SOLDS_PARALLEL },
  "comp-from-sales": { kind: "ready", matches: [PREVIEW_FROM_SALES], solds: PREVIEW_SOLDS_PARALLEL },
  "comp-run-only": { kind: "ready", matches: [PREVIEW_RUN_ONLY], solds: PREVIEW_SOLDS_RUN_ONLY },
  raw: { kind: "ready", matches: PREVIEW_RAW, solds: PREVIEW_SOLDS_NONE },
  numbered: { kind: "ready", matches: [PREVIEW_NUMBERED, ...PREVIEW_RAW.slice(1)] },
  matching: { kind: "matching" },
  none: { kind: "none" },
  offline: { kind: "none", offline: true },
  comp: { kind: "ready", matches: [PREVIEW_SLAB], solds: PREVIEW_SOLDS },
  "comp-raw": { kind: "ready", matches: PREVIEW_RAW },
  "comp-none": {
    kind: "ready",
    matches: [{ ...PREVIEW_RAW[0], playerName: "Paul Skenes", sport: "Baseball", yearLabel: "2024", setBrand: "Topps Update", cardNumber: "US50" }],
    solds: PREVIEW_SOLDS_NONE,
  },
  "comp-looking": { kind: "ready", matches: [PREVIEW_SLAB], solds: PREVIEW_SOLDS_LOOKING },
  "comp-limited": { kind: "ready", matches: [PREVIEW_SLAB], solds: PREVIEW_SOLDS_LIMITED },
};

const LABELS: Record<PreviewKind, string> = {
  slab: "Slab",
  raw: "Raw, parallel open",
  numbered: "Numbered",
  matching: "Matching",
  none: "No match",
  offline: "Offline",
  comp: "Comp a slab",
  "comp-raw": "Comp a raw card",
  "comp-none": "Comp, no sales",
  "comp-looking": "Comp, looking up",
  "comp-limited": "Comp, daily cap",
  "slab-looking": "Slab, looking up",
  "from-sales": "Parallel from sales",
  "comp-from-sales": "Comp, parallel from sales",
  "comp-run-only": "Comp, numbered, no color named",
  hub: "Hub, no reader",
  "hub-comp": "Hub comp, no reader",
  door: "Add card door",
};

const noop = () => {};

/** The hub as the web sees it: no card reader in this build. */
const PREVIEW_HUB_DEPS = { scannerAvailable: async () => false };

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
      {!open && !SCREENS.has(kind) ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white"
        >
          Open the sheet
        </button>
      ) : null}
      {kind === "hub" || kind === "hub-comp" ? (
        <div className="rounded-3xl border border-zinc-200 p-4 dark:border-white/10">
          <ScanHub key={kind} purpose={kind === "hub" ? "add" : "comp"} deps={PREVIEW_HUB_DEPS} />
        </div>
      ) : null}
      {kind === "door" ? (
        <SearchDoor
          initialQuery=""
          recent={["Victor Wembanyama", "Caitlin Clark"]}
          owned={[]}
          insert={null}
          setBrand=""
          onQuery={noop}
          onPickPlayer={noop}
          onPickInsert={noop}
          onPickSet={noop}
          onPickCatalog={noop}
          onStepByStep={noop}
          scanHref="/scan"
        />
      ) : null}
      {open && !SCREENS.has(kind) && kind.startsWith("comp") ? (
        <CompSheet
          key={kind}
          photo={PREVIEW_PHOTO}
          state={STATES[kind as keyof typeof STATES]}
          lookup={previewCompLookup}
          onAdd={confirm}
          onScanAnother={() => setOpen(false)}
          onSearch={() => router.push("/comp")}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {open && !SCREENS.has(kind) && !kind.startsWith("comp") ? (
        <ConfirmSheet
          key={kind}
          photo={PREVIEW_PHOTO}
          state={STATES[kind as keyof typeof STATES]}
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
