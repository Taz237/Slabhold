"use client";

import { useEffect, useState } from "react";
import { photoSource } from "@/lib/collection/grid";
import type { FounderCard, FounderShowcase } from "@/lib/landing/founder";

export type FounderState =
  | { status: "loading" }
  | { status: "ready"; showcase: FounderShowcase };

/** Past this, the landing page settles on sample slabs and the plain note. */
const FOUNDER_TIMEOUT_MS = 4000;

const NONE: FounderShowcase = { profile: null, cards: [] };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One hero card, or null. Photos outside our card-photos bucket are dropped. */
function readCard(value: unknown): FounderCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const source = photoSource(str(card.photoUrl));
  if (typeof card.id !== "string" || source.kind !== "optimized" || !str(card.playerName)) return null;
  return {
    id: card.id,
    photoUrl: source.src,
    playerName: str(card.playerName),
    year: typeof card.year === "number" ? card.year : 0,
    yearLabel: str(card.yearLabel),
    setBrand: str(card.setBrand),
    grade: str(card.grade),
    gradeQualifier: str(card.gradeQualifier),
    certNumber: "",
    accent: str(card.accent),
    conditionType: card.conditionType === "graded" || card.conditionType === "raw" ? card.conditionType : undefined,
    grader: str(card.grader) || undefined,
  };
}

/** Keeps only the shape the landing page draws. Anything else is no founder. */
export function readFounderShowcase(value: unknown): FounderShowcase {
  if (!value || typeof value !== "object") return NONE;
  const { profile, cards } = value as { profile?: unknown; cards?: unknown };
  if (!profile || typeof profile !== "object") return NONE;
  const { username, displayName, avatarUrl } = profile as Record<string, unknown>;
  if (typeof username !== "string" || !username) return NONE;
  return {
    profile: {
      username,
      displayName: typeof displayName === "string" && displayName ? displayName : username,
      avatarUrl: typeof avatarUrl === "string" && avatarUrl.startsWith("https://") ? avatarUrl : null,
    },
    cards: Array.isArray(cards)
      ? cards.flatMap((card) => {
          const read = readCard(card);
          return read ? [read] : [];
        }).slice(0, 3)
      : [],
  };
}

/** The founder's public profile and top cards, from the hour-cached landing route. */
export function useFounderShowcase(): FounderState {
  const [state, setState] = useState<FounderState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FOUNDER_TIMEOUT_MS);
    const settle = (showcase: FounderShowcase) => {
      if (live) setState({ status: "ready", showcase });
    };
    fetch("/api/landing/founder", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => settle(readFounderShowcase(body)))
      .catch(() => settle(NONE))
      .finally(() => window.clearTimeout(timer));
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return state;
}
