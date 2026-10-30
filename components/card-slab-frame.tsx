import type { CSSProperties, ReactNode } from "react";
import { initials } from "@/lib/format";
import { slabCompany, slabNumber, slabTone, tileKind, yearSetLine, type SlabTone } from "@/lib/collection/grid";
import type { SportsCard } from "@/lib/types";

export type ArtCard = Pick<
  SportsCard,
  | "playerName"
  | "year"
  | "yearLabel"
  | "setBrand"
  | "grade"
  | "gradeQualifier"
  | "certNumber"
  | "accent"
> & {
  /** Public cards may not say. The grade then decides. */
  conditionType?: SportsCard["conditionType"];
  /** public_cards.grader, when known. */
  grader?: string;
};

/** Flat label colors. Text only, no grader logos. */
const LABEL_TONES: Record<SlabTone, string> = {
  psa: "bg-[#C8102E] text-white",
  bgs: "bg-gradient-to-b from-[#E4E7EB] to-[#B9BEC6] text-zinc-950",
  sgc: "bg-[#111113] text-zinc-50 ring-1 ring-inset ring-white/15",
  cgc: "bg-[#1F5FBF] text-white",
  neutral: "bg-zinc-200 text-zinc-900",
};

const FALLBACK_ACCENT = "#7C3AED";

function accentColor(accent: string | null | undefined): string {
  const value = (accent ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : FALLBACK_ACCENT;
}

/**
 * The slab or card around a photo, with no state of its own, so the server can
 * draw it (the landing hero) and so can the collection grid. Fills a 3:5 box.
 */
export function SlabFrame({ card, children }: { card: ArtCard; children: ReactNode }) {
  if (tileKind(card) === "card") {
    return (
      <div className="flex aspect-[3/5] w-full flex-col justify-end" data-kind="card">
        <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg border border-black/10 bg-zinc-900 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.55)] dark:border-white/10">
          {children}
        </div>
      </div>
    );
  }

  const tone = slabTone(card);
  const company = slabCompany(card) || "Graded";
  const number = slabNumber(card);
  const qualifier = card.gradeQualifier.trim();
  const cert = card.certNumber.trim();

  return (
    <div
      className="relative flex aspect-[3/5] w-full flex-col gap-1.5 overflow-hidden rounded-[10px] border border-white/25 bg-gradient-to-b from-zinc-100/90 to-zinc-300/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_0_1px_rgba(255,255,255,0.25),inset_0_-8px_18px_rgba(0,0,0,0.12),0_12px_28px_-12px_rgba(0,0,0,0.6)] dark:border-white/15 dark:from-white/[0.14] dark:to-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_-10px_20px_rgba(0,0,0,0.35),0_14px_30px_-12px_rgba(0,0,0,0.8)]"
      data-kind="slab"
      data-tone={tone}
    >
      <div className={`shrink-0 rounded-[5px] px-1.5 py-1 ${LABEL_TONES[tone]}`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[7.5px] leading-[10px] font-medium tracking-wider uppercase opacity-80">
              {yearSetLine(card) || "Graded card"}
            </p>
            <p className="truncate text-[9.5px] leading-3 font-extrabold tracking-tight uppercase">
              {card.playerName}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[7.5px] leading-[10px] font-semibold tracking-wider uppercase opacity-90">
              {company}
            </p>
            <p className="text-[15px] leading-4 font-extrabold tracking-tight tabular-nums">
              {number || "—"}
            </p>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-8 shrink-0 opacity-60 [background:repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_2px,currentColor_2px_4px,transparent_4px_5px)]"
            aria-hidden
          />
          <span className="truncate font-mono text-[7px] leading-[9px] tracking-wider uppercase opacity-75">
            {[qualifier, cert ? `#${cert}` : ""].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="relative aspect-[5/7] h-full max-w-full overflow-hidden rounded-[3px] bg-zinc-900 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]">
          {children}
        </div>
      </div>
      {/* Acrylic glare, top-left. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] bg-[linear-gradient(135deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.08)_22%,transparent_42%)] mix-blend-screen"
        aria-hidden
      />
    </div>
  );
}

/** Designed stand-in for a missing or broken photo. */
export function PhotoPlaceholder({ card }: { card: ArtCard }) {
  const accent = accentColor(card.accent);
  const style: CSSProperties = {
    backgroundImage: [
      "repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 7px)",
      "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.12) 45%, transparent 60%)",
      `linear-gradient(160deg, ${accent} 0%, color-mix(in oklab, ${accent} 45%, #09090b) 55%, #09090b 100%)`,
    ].join(", "),
  };
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center text-white"
      style={style}
      data-placeholder
      aria-hidden
    >
      <span className="text-3xl font-extrabold tracking-tight drop-shadow-sm">
        {initials(card.playerName) || "?"}
      </span>
      <span className="mt-1 line-clamp-2 font-mono text-[9px] leading-3 tracking-wider text-white/75 uppercase">
        {yearSetLine(card)}
      </span>
    </div>
  );
}
