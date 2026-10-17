/** Ask the server to match a new post or listing. Failures stay silent. */
export function pingWantMatch(sourceType: "post" | "listing", sourceId: string) {
  if (typeof window === "undefined" || !sourceId) return;
  void fetch("/api/wants/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceType, sourceId }),
  }).catch(() => undefined);
}
