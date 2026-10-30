/**
 * The quoted post's header, like X: name, handle and "· time" on one line.
 * The name gives way first, down to a few letters, then the handle, which
 * keeps "@" and a couple of letters. The time never truncates or wraps.
 *
 * Flex shares a shortfall by shrink weight times width, and any share at all
 * puts an ellipsis on the handle. At 10000:1 the handle's share stays under
 * a layout pixel (1/64 px) until the name is down to its minimum.
 */
export const QUOTE_HEADER = {
  row: "flex min-w-0 flex-nowrap items-baseline gap-x-1 overflow-hidden whitespace-nowrap text-[13px]",
  name: "min-w-[5ch] shrink-[10000] truncate font-bold",
  handle: "min-w-[4ch] shrink truncate text-zinc-500",
  time: "shrink-0 whitespace-nowrap text-zinc-500",
} as const;
