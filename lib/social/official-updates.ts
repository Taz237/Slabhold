/**
 * Profile id of the official updates account (@slabholdupdates). The handle
 * can change; code matches this id and does not look up a username.
 * New signups follow @slabhold instead; see ./signup-auto-follow.ts.
 * Override with OFFICIAL_UPDATES_USER_ID. An empty or invalid value is a no-op.
 * The env uuid and the SQL uuid in private.follow_official_updates must stay in sync.
 * See supabase/migrations/20261022210000_follow_official_updates.sql
 * and supabase/migrations/20261022240000_skip_test_autofollow.sql.
 */
export const OFFICIAL_UPDATES_USER_ID = "6d31ab97-9162-4296-876d-9e0378872fce";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Undefined uses the default id. Blank or non-uuid values match nobody. */
export function officialUpdatesUserId(raw?: string | null): string | null {
  const value = (raw == null ? OFFICIAL_UPDATES_USER_ID : raw).trim();
  if (!value || !UUID.test(value)) return null;
  return value.toLowerCase();
}

/** True only for the updates profile id. A matching handle is not enough. */
export function isOfficialUpdatesAccount(id: string | null | undefined): boolean {
  const officialId = officialUpdatesUserId();
  if (!officialId || !id) return false;
  return id.trim().toLowerCase() === officialId;
}
