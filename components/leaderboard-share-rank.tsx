"use client";

import { useEffect, useRef, useState } from "react";
import { Share } from "lucide-react";
import { absoluteUrl, copyText } from "@/components/share-button";
import { trackEvent } from "@/lib/analytics";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { shareFunction } from "@/lib/ios/share";
import { nativeShareOrSheet, postSharePayload } from "@/lib/share/sheet";

export type RankShare = {
  /** The viewer's own rank image (lib/leaderboard/hooks.ts rankSharePath). */
  imagePath: string;
  /** The board and week the share opens. */
  link: string;
  /** "#3 on Most cards added this week on Slabhold". */
  text: string;
};

const FILENAME = "slabhold-rank.png";

/**
 * Share my rank: the rank image with the board's link. In the iOS app, the
 * iPhone share sheet with the image; on the web, the browser's share sheet
 * with the image when it takes files. Anything else copies the link.
 */
export function ShareRankButton({
  share,
  variant = "icon",
  className = "",
}: {
  share: RankShare;
  /** icon: a 44px round button. button: a labelled pill. */
  variant?: "icon" | "button";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const image = useRef<Promise<Blob | null> | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Fetch the image on intent, so the tap itself can still open the share sheet on iPhone. */
  function warm() {
    image.current ??= fetch(share.imagePath)
      .then((response) => (response.ok ? response.blob() : null))
      .catch(() => null);
    return image.current;
  }

  async function onShare(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    trackEvent("share_clicked");
    setBusy(true);
    try {
      const blob = await warm();
      const url = absoluteUrl(share.link);
      const payload = postSharePayload({ title: "My Slabhold rank", text: share.text, url });
      const files = blob ? [new File([blob], FILENAME, { type: "image/png" })] : undefined;
      if (files && isNativeApp()) {
        let outcome: "shared" | "cancelled" | "unavailable" = "unavailable";
        try {
          outcome = await (await loadNative()).shareFilesNative({ files, text: `${share.text} ${url}` });
        } catch {
          outcome = "unavailable";
        }
        if (outcome !== "unavailable") return;
      }
      const result = await nativeShareOrSheet(payload, shareFunction(), {
        files,
        canShare: typeof navigator.canShare === "function" ? navigator.canShare.bind(navigator) : undefined,
      });
      if (result !== "sheet") return;
      if (!(await copyText(url))) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } finally {
      setBusy(false);
    }
  }

  const shape =
    variant === "icon"
      ? "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15"
      : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-5 text-15 font-semibold text-white hover:bg-white/15";

  return (
    <>
      <button
        type="button"
        data-share-rank=""
        aria-label={variant === "icon" ? "Share my rank" : undefined}
        aria-busy={busy || undefined}
        onPointerDown={warm}
        onFocus={warm}
        onClick={(event) => void onShare(event)}
        className={`tap ${shape} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${className}`}
      >
        <Share aria-hidden="true" className="h-4 w-4" />
        {variant === "button" ? <span>Share my rank</span> : null}
      </button>
      {copied ? (
        <p
          role="status"
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-[70] -translate-x-1/2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-lg"
        >
          Link copied
        </p>
      ) : null}
    </>
  );
}
