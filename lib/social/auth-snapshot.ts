/**
 * Supabase emits SIGNED_IN when a tab loads and again whenever it becomes visible.
 * Reload the site snapshot only when the signed-in user actually changes.
 * Sign-out always reloads.
 */
export function authSnapshotReload(input: {
  event: string;
  nextUserId: string | null;
  lastUserId: string | null;
}): { reload: boolean; lastUserId: string | null } {
  if (input.event === "SIGNED_OUT") {
    return { reload: true, lastUserId: null };
  }
  if (input.event !== "SIGNED_IN") {
    return { reload: false, lastUserId: input.lastUserId };
  }
  if (input.nextUserId === input.lastUserId) {
    return { reload: false, lastUserId: input.lastUserId };
  }
  return { reload: true, lastUserId: input.nextUserId };
}
