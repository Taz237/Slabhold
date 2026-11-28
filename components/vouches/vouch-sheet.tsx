"use client";

import { PartLoadFailed } from "@/components/part-load-failed";
import type { VouchReplySheetProps, VouchSheetProps } from "@/components/vouches/vouch-sheets";
import { lazyPart } from "@/lib/ui/lazy-part";

/**
 * The vouch sheet and the reply sheet. They only draw after a tap, so they are their own chunk
 * (components/vouches/vouch-sheets.tsx), fetched on that tap. `warm()` on press starts it early.
 */
export const VouchSheet = lazyPart<VouchSheetProps>(() => import("@/components/vouches/vouch-sheets").then((mod) => mod.VouchSheet), null, {
  name: "vouch-sheet",
  failed: PartLoadFailed,
});

export const VouchReplySheet = lazyPart<VouchReplySheetProps>(() => import("@/components/vouches/vouch-sheets").then((mod) => mod.VouchReplySheet), null, {
  name: "vouch-reply-sheet",
  failed: PartLoadFailed,
});
