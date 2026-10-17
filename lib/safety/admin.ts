/** Comma-separated user ids. Empty, missing, and blank entries are ignored. */
export function parseAdminIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isAdmin(
  userId: string | null | undefined,
  raw: string | null | undefined = process.env.ADMIN_USER_IDS,
): boolean {
  if (!userId) return false;
  return parseAdminIds(raw).includes(userId);
}

/** Non-admins, including signed-out visitors, are not found. */
export function adminAccess(
  userId: string | null | undefined,
  raw: string | null | undefined = process.env.ADMIN_USER_IDS,
): "allow" | "notFound" {
  return isAdmin(userId, raw) ? "allow" : "notFound";
}
