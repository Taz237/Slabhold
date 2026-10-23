"use server";

import { revalidateTag } from "next/cache";
import { VALUE_BOARD_CACHE_TAG } from "./cache";

/** Drop the shared value board so an opt-out is not stuck behind the 15-minute cache. */
export async function revalidateValueBoard(): Promise<void> {
  revalidateTag(VALUE_BOARD_CACHE_TAG, { expire: 0 });
}
