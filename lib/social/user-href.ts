/**
 * Profile (`/u`) or DM (`/messages`) path for a username.
 * A leading @ is display-only. The rest is encoded so it stays one path segment.
 */
export function userHref(username: string, root: "u" | "messages" = "u"): string {
  const handle = encodeURIComponent(username.replace(/^@/, "").trim());
  return `/${root}/${handle}`;
}
