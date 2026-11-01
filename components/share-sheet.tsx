"use client";

import { useState } from "react";
import { Share } from "lucide-react";
import { absoluteUrl } from "@/components/share-button";
import { trackEvent } from "@/lib/analytics";
import { SheetLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";
import { withShareRef } from "@/lib/share/links";
import { nativeShareOrSheet } from "@/lib/share/sheet";

export type ShareSource = "badge" | "card" | "invite" | "collection";

export type ShareTarget = {
  /** Page to link to, e.g. /u/democollector/badges/collector/gold. */
  path: string;
  title: string;
  /** Short line that goes with the link, e.g. "Just unlocked Gold Collector on Slabhold". */
  text: string;
  /** 1080×1350 PNG for Instagram. */
  imagePath?: string;
  source: ShareSource;
};

/** The absolute link with ref=share. Before the browser takes over, the bare path. */
export function shareUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return withShareRef(absoluteUrl(path));
}

/** The sheet only draws after a tap: its own chunk, fetched on the tap. */
export const ShareSheet = lazyPart(
  () => import("@/components/share-sheet-view").then((mod) => mod.ShareSheet),
  null,
  { name: "share-sheet", failed: SheetLoadFailed },
);

/** Native share sheet on iPhone. Elsewhere, a small sheet: Post on X, Copy link, Save image. */
export function useShareSheet(target: ShareTarget) {
  const [open, setOpen] = useState(false);

  async function share() {
    void ShareSheet.preload().catch(() => {});
    const url = shareUrl(target.path);
    const result = await nativeShareOrSheet(
      { title: target.title, text: target.text, url },
      typeof navigator !== "undefined" && navigator.share ? navigator.share.bind(navigator) : undefined,
    );
    if (result === "shared") trackEvent("share", { source: target.source, method: "native" });
    if (result === "sheet") setOpen(true);
  }

  const sheet = open ? <ShareSheet target={target} onClose={() => setOpen(false)} /> : null;
  return { share, sheet };
}

export function ShareButton({
  target,
  variant = "pill",
  label = "Share",
  className = "",
}: {
  target: ShareTarget;
  variant?: "pill" | "icon" | "reveal";
  /** Accessible name, and the visible text on pill buttons. */
  label?: string;
  className?: string;
}) {
  const { share, sheet } = useShareSheet(target);
  const styles = {
    pill: "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-900 dark:border-white/20 dark:text-zinc-100",
    icon: "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100",
    reveal:
      "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-[15px] font-semibold",
  }[variant];
  return (
    <>
      <button
        type="button"
        aria-label={variant === "icon" ? label : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void share();
        }}
        className={`${styles} ${className}`}
      >
        <Share aria-hidden className="h-4 w-4" />
        {variant === "icon" ? null : <span>{label}</span>}
      </button>
      {sheet}
    </>
  );
}

