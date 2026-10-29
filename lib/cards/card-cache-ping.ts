/** Tell the server a card's public switch or delete saved, so its card page refreshes. */
export function pingCardCache(cardId: string) {
  if (typeof window === "undefined" || !cardId) return;
  void fetch("/api/cards/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId }),
  }).catch(() => undefined);
}
