import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScanSheetPreview, type PreviewKind } from "@/components/scan/scan-sheet-preview";
import { scanPreviewAllowed } from "@/lib/scan/confirm";

export const metadata: Metadata = {
  title: "Scan preview · Slabhold",
  robots: { index: false, follow: false },
};

const KINDS: readonly PreviewKind[] = [
  "slab",
  "slab-looking",
  "from-sales",
  "comp-from-sales",
  "raw",
  "numbered",
  "matching",
  "none",
  "offline",
  "comp",
  "comp-raw",
  "comp-none",
  "comp-looking",
  "comp-limited",
  "hub",
  "hub-comp",
  "door",
];

/** The confirm sheet on made-up scans, for review. Not in production unless the scanner is on. */
export default async function ScanPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  if (!scanPreviewAllowed()) notFound();
  const raw = (await searchParams).state;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const kind = KINDS.find((item) => item === value) ?? "slab";
  return <ScanSheetPreview kind={kind} />;
}
