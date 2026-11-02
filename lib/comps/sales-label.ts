/**
 * "Based on N sales". No imports on purpose: the card page shell's skeleton
 * uses it without pulling the comps matching code into first load.
 */
export function basedOnSalesLabel(count: number): string {
  return `Based on ${count} sale${count === 1 ? "" : "s"}`;
}
