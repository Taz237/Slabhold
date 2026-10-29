"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Link2, Share, X } from "lucide-react";
import { absoluteUrl, copyText } from "@/components/share-button";
import { trackEvent } from "@/lib/analytics";
import { withShareRef, xIntentUrl } from "@/lib/share/links";
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

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.33l4.38 5.79L17.75 3Zm-1.08 16.2h1.7L7.4 4.72H5.58l11.09 14.48Z" />
    </svg>
  );
}

/** The absolute link with ref=share. Before the browser takes over, the bare path. */
function shareUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return withShareRef(absoluteUrl(path));
}

/** Native share sheet on iPhone. Elsewhere, a small sheet: Post on X, Copy link, Save image. */
export function useShareSheet(target: ShareTarget) {
  const [open, setOpen] = useState(false);

  async function share() {
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

const rowClass =
  "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]";

const iconWell = "grid h-10 w-10 shrink-0 place-items-center rounded-full";

export function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const url = shareUrl(target.path);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    // Capture phase, so Escape closes only this sheet and not one underneath it.
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  async function onCopy() {
    const ok = await copyText(url);
    setCopied(ok ? "copied" : "failed");
    if (ok) trackEvent("share", { source: target.source, method: "copy" });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-end bg-black/60 motion-safe:animate-[lightbox-fade_150ms_ease-out] sm:place-items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl border-t border-zinc-200 bg-[var(--background)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <div className="flex items-center justify-between gap-3 px-2 pt-1">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold tracking-tight">
              Share
            </h2>
            <p className="truncate text-[13px] text-zinc-500">{target.title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="mt-1">
          <li>
            <a
              href={xIntentUrl({ text: target.text, url })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("share", { source: target.source, method: "x" })}
              className={rowClass}
            >
              <span className={`${iconWell} bg-zinc-950 text-white dark:bg-white dark:text-zinc-950`}>
                <XLogo className="h-4 w-4" />
              </span>
              Post on X
            </a>
          </li>
          <li>
            <button type="button" onClick={() => void onCopy()} className={rowClass}>
              <span className={`${iconWell} bg-violet-500/15 text-violet-700 dark:text-[#A78BFA]`}>
                {copied === "copied" ? <Check aria-hidden className="h-4 w-4" /> : <Link2 aria-hidden className="h-4 w-4" />}
              </span>
              {copied === "copied" ? "Link copied" : "Copy link"}
            </button>
          </li>
          {target.imagePath ? (
            <li>
              <a
                href={target.imagePath}
                download
                onClick={() => trackEvent("share", { source: target.source, method: "image" })}
                className={rowClass}
              >
                <span className={`${iconWell} bg-violet-500/15 text-violet-700 dark:text-[#A78BFA]`}>
                  <Download aria-hidden className="h-4 w-4" />
                </span>
                <span className="flex flex-col">
                  Save image
                  <span className="text-xs font-normal text-zinc-500">Sized for Instagram</span>
                </span>
              </a>
            </li>
          ) : null}
        </ul>
        <p role="status" className="min-h-5 px-3 text-xs text-zinc-500">
          {copied === "failed" ? "Couldn't copy. Press and hold the link to copy it." : ""}
        </p>
      </div>
      {copied === "copied" ? (
        <p
          role="status"
          data-share-toast=""
          className="pointer-events-none fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 z-[71] -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg motion-safe:animate-[pill-in_260ms_cubic-bezier(0.2,0.7,0.2,1)_both] dark:bg-zinc-100 dark:text-zinc-950"
        >
          Link copied
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
