/**
 * Composers never cut text. Over the limit, the text stays as typed or
 * pasted, the ring shows how far over, and submit waits until it's trimmed.
 * Counted like the server counts it (UTF-16 length).
 */
export function isOverLimit(text: string, limit: number): boolean {
  return text.length > limit;
}
