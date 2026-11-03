"use client";

import { BadgeRevealView } from "@/components/badges/badge-reveal";
import { BADGE_THRESHOLDS, BADGE_TIERS, CATEGORY_COPY, TIER_LABELS, type BadgeTier } from "@/lib/badges/config";
import type { BadgeReveal } from "@/lib/badges/reveal";

/** The reveal for a sample Collector badge at `tier`. Never saved, never seen-marked. */
export function sampleReveal(tier: BadgeTier): BadgeReveal {
  const at = BADGE_TIERS.indexOf(tier);
  const nextTier = BADGE_TIERS[at + 1];
  const unit = CATEGORY_COPY.collector.unit;
  return {
    headline: { id: "sample", category: "collector", tier },
    title: `Collector ${TIER_LABELS[tier]} unlocked`,
    next: nextTier
      ? `${BADGE_THRESHOLDS.collector[at]} / ${BADGE_THRESHOLDS.collector[at + 1]} ${unit} to ${TIER_LABELS[nextTier]}`
      : null,
    others: [],
    ids: [],
  };
}

/** Pinning in the sample does nothing and always "works". */
async function samplePins() {
  return { ok: true as const };
}

/**
 * The real badge reveal (#171), replayed with a sample badge. No username, so
 * no Share; pins go nowhere; Close just closes.
 */
export default function BadgePopup({ tier, onClose }: { tier: BadgeTier; onClose: () => void }) {
  return <BadgeRevealView reveal={sampleReveal(tier)} pinned={[]} onClose={onClose} savePins={samplePins} />;
}
