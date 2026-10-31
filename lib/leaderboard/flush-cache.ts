import { VALUE_BOARD_CACHE_TAG } from "./cache";

/** Drop the shared value board. Only an authenticated server path should call this. */
export async function flushValueBoardCache(): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  revalidateTag(VALUE_BOARD_CACHE_TAG, { expire: 0 });
}
