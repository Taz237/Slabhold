import { formatCardValueLabel } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

/**
 * Share-preview dollar label. Reads the stored card_values row only.
 * A comps batch is not priced here, so the preview matches the saved median.
 */
export function previewValueLabelFromSources(input: {
  stored: CardValueResult | null | undefined;
  createdAt?: string | null;
}): string {
  return formatCardValueLabel(input.stored, { createdAt: input.createdAt });
}
