import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin readout: signups in the last 30 days by where they came from, read
 * from auth user metadata (signup_source, utm_source, signup_platform) with
 * the service-role admin client. Read-only. Only metadata and created_at are
 * looked at; no email or id leaves this file.
 */
export const SIGNUP_SOURCE_WINDOW_DAYS = 30;

const PER_PAGE = 1000;
const MAX_PAGES = 20;

export type SignupSourceRow = { label: string; web: number; ios: number; total: number };

type AuthUserLike = { created_at?: unknown; user_metadata?: unknown };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;
}

function labelFor(meta: Record<string, unknown>): { label: string; rank: number } {
  const source = text(meta.signup_source);
  if (source === "invite") return { label: "Invite", rank: 0 };
  if (source === "utm") return { label: `Campaign: ${text(meta.utm_source) ?? "unknown"}`, rank: 1 };
  if (source === "direct") return { label: "Direct", rank: 2 };
  return { label: "Not recorded", rank: 3 };
}

export function summarizeSignupSources(users: readonly AuthUserLike[], now = Date.now()): SignupSourceRow[] {
  const since = now - SIGNUP_SOURCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const rows = new Map<string, SignupSourceRow & { rank: number }>();
  for (const user of users) {
    const created = typeof user.created_at === "string" ? Date.parse(user.created_at) : NaN;
    if (!Number.isFinite(created) || created < since || created > now + 60_000) continue;
    const meta =
      user.user_metadata && typeof user.user_metadata === "object" ? (user.user_metadata as Record<string, unknown>) : {};
    const { label, rank } = labelFor(meta);
    const row = rows.get(label) ?? { label, rank, web: 0, ios: 0, total: 0 };
    const platform = text(meta.signup_platform);
    if (platform === "ios-app") row.ios += 1;
    else if (platform === "web") row.web += 1;
    row.total += 1;
    rows.set(label, row);
  }
  return [...rows.values()]
    .sort((a, b) => a.rank - b.rank || b.total - a.total || a.label.localeCompare(b.label))
    .map(({ label, web, ios, total }) => ({ label, web, ios, total }));
}

export type SignupSourcesResult = { status: "ready"; rows: SignupSourceRow[] } | { status: "unavailable" };

/** Pages through auth users with the admin client. Never throws. */
export async function loadSignupSources(admin: SupabaseClient | null, now = Date.now()): Promise<SignupSourcesResult> {
  if (!admin) return { status: "unavailable" };
  try {
    const users: AuthUserLike[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) return { status: "unavailable" };
      const batch = data?.users ?? [];
      for (const user of batch) users.push({ created_at: user.created_at, user_metadata: user.user_metadata });
      if (batch.length < PER_PAGE) break;
    }
    return { status: "ready", rows: summarizeSignupSources(users, now) };
  } catch {
    return { status: "unavailable" };
  }
}
