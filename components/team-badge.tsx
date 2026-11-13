"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TEAM_BADGE_LABEL, hasTeamBadge } from "@/lib/social/team-badge";

/** How long the tooltip stays up after a tap. */
const TIP_MS = 2200;

/**
 * The Slabhold team badge: the logo's slab mark in a purple circle, the size
 * of a verified check, drawn right after a display name. Renders nothing for
 * anyone off the list in `lib/social/team-badge.ts`, or for an account that
 * already wears the official mark. A tap shows a small "Slabhold team" tip
 * and never follows the link the name may sit in.
 *
 * `inLink`: the name sits inside a link (a whole tappable row). The badge is
 * then a labelled image, not a second focusable control inside the link,
 * but a tap on it still shows the tip instead of opening the row.
 */
export function TeamBadge({
  username,
  official = false,
  size = "sm",
  inLink = false,
  className = "",
}: {
  username: string | null | undefined;
  official?: boolean;
  /** sm: 16px, beside 13-15px names. md: 20px, beside the profile header name. */
  size?: "sm" | "md";
  inLink?: boolean;
  className?: string;
}) {
  if (!hasTeamBadge(username, { official })) return null;
  return <TeamBadgeMark size={size} inLink={inLink} className={className} />;
}

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

function TeamBadgeMark({ size, inLink, className }: { size: "sm" | "md"; inLink: boolean; className: string }) {
  const ref = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(null), TIP_MS);
    const close = () => setTip(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTip(null);
    };
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [tip]);

  function toggle(event: MouseEvent<HTMLElement>) {
    // The badge often sits beside a name inside a link or a tappable row.
    event.preventDefault();
    event.stopPropagation();
    if (tip) {
      setTip(null);
      return;
    }
    const box = ref.current?.getBoundingClientRect();
    if (box) setTip({ x: box.left + box.width / 2, y: box.top });
  }

  const base = `hit-44 inline-flex ${SIZES[size]} shrink-0 cursor-pointer items-center justify-center self-center rounded-full`;
  return (
    <>
      {inLink ? (
        <span
          ref={ref}
          role="img"
          aria-label={TEAM_BADGE_LABEL}
          title={TEAM_BADGE_LABEL}
          data-team-badge=""
          onClick={toggle}
          className={`${base} ${className}`}
        >
          <TeamMark className={SIZES[size]} />
        </span>
      ) : (
        <button
          ref={ref as RefObject<HTMLButtonElement>}
          type="button"
          aria-label={TEAM_BADGE_LABEL}
          title={TEAM_BADGE_LABEL}
          data-team-badge=""
          onClick={toggle}
          onBlur={() => setTip(null)}
          className={`${base} focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none ${className}`}
        >
          <TeamMark className={SIZES[size]} />
        </button>
      )}
      {tip && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              data-team-badge-tip=""
              style={{ left: tip.x, top: tip.y }}
              className="team-badge-tip pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-lg bg-zinc-900 px-2 py-1 text-12 leading-4 font-medium whitespace-nowrap text-zinc-100 shadow-lg ring-1 ring-white/10"
            >
              {TEAM_BADGE_LABEL}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

/** The logo's slab and star, white on brand purple, in a circle. */
function TeamMark({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={16} height={16} className={className}>
      <circle cx="8" cy="8" r="8" fill="#7C3AED" />
      <rect x="5.25" y="3" width="5.5" height="10" rx="1" fill="#fff" />
      <rect x="6.1" y="3.9" width="3.8" height="1.4" rx="0.35" fill="#5B21B6" />
      <path
        fill="#5B21B6"
        d="M8 7.2 8.43 8.42 9.73 8.46 8.7 9.25 9.07 10.49 8 9.76 6.93 10.49 7.3 9.25 6.27 8.46 7.57 8.42Z"
      />
    </svg>
  );
}
