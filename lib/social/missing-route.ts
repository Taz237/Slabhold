import { isStaticPublicPath } from "@/lib/auth/route-access";
import { isUuid } from "@/lib/value/card-value-access";
import { normalizeUsername } from "./usernames";

const USERNAME = /^[a-z0-9_]{3,20}$/;

export type MissingCheck =
  | { kind: "post"; id: string }
  | { kind: "profile"; username: string }
  | { kind: "public-card"; username: string; id: string }
  | { kind: "card-posts"; id: string }
  | { kind: "owner-card"; id: string };

export type SessionRead = "anonymous" | "unknown" | { token: string };

type Cookie = { name: string; value: string };

/** Dynamic card, post, and profile URLs. Other paths are left alone. */
export function missingCheckForPath(pathname: string): MissingCheck | null {
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts[0] === "posts" && parts.length === 2) {
    return { kind: "post", id: parts[1] };
  }
  if (parts[0] === "u" && parts.length === 2) {
    return { kind: "profile", username: parts[1] };
  }
  if (
    parts[0] === "u" &&
    parts.length === 3 &&
    (parts[2] === "followers" || parts[2] === "following")
  ) {
    return { kind: "profile", username: parts[1] };
  }
  if (parts[0] === "u" && parts.length === 4 && parts[2] === "cards") {
    return { kind: "public-card", username: parts[1], id: parts[3] };
  }
  if (parts[0] === "cards" && parts.length === 3 && parts[2] === "posts") {
    if (!isUuid(parts[1])) return null;
    return { kind: "card-posts", id: parts[1] };
  }
  if (parts[0] === "cards" && (parts.length === 2 || (parts.length === 3 && parts[2] === "edit"))) {
    if (!isUuid(parts[1])) return null;
    return { kind: "owner-card", id: parts[1] };
  }
  return null;
}

export function readSupabaseAccessToken(input: {
  supabaseUrl: string | undefined;
  cookies: Cookie[];
}): SessionRead {
  const url = input.supabaseUrl?.trim();
  if (!url) return "anonymous";
  let ref = "";
  try {
    ref = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "unknown";
  }
  if (!ref) return "unknown";
  const name = `sb-${ref}-auth-token`;
  const direct = input.cookies.find((cookie) => cookie.name === name)?.value;
  const chunks: string[] = [];
  if (!direct) {
    for (let index = 0; index < 5; index += 1) {
      const part = input.cookies.find((cookie) => cookie.name === `${name}.${index}`)?.value;
      if (!part) break;
      chunks.push(part);
    }
  }
  const raw = direct ?? (chunks.length > 0 ? chunks.join("") : "");
  if (!raw) return "anonymous";
  const token = accessTokenFromCookie(raw);
  return token ? { token } : "unknown";
}

function accessTokenFromCookie(raw: string): string | null {
  const encoded = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { access_token?: unknown };
    return typeof parsed.access_token === "string" && parsed.access_token ? parsed.access_token : null;
  } catch {
    return null;
  }
}

type Row = { id?: string; user_id?: string };

async function restRows(
  supabaseUrl: string,
  anonKey: string,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Row[] | null> {
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as Row[]) : null;
  } catch {
    return null;
  }
}

/**
 * True only when Supabase is configured and the record is confirmed missing.
 * Lookup errors and local mode stay on the page.
 */
export async function pathIsMissing(input: {
  pathname: string;
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  cookies: Cookie[];
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (isStaticPublicPath(input.pathname)) return false;
  const check = missingCheckForPath(input.pathname);
  const url = input.supabaseUrl?.trim();
  const key = input.anonKey?.trim();
  if (!check || !url || !key) return false;
  const fetchImpl = input.fetchImpl ?? fetch;
  const session = readSupabaseAccessToken({ supabaseUrl: url, cookies: input.cookies });

  if (check.kind === "post") {
    if (!isUuid(check.id)) return true;
    const rows = await restRows(
      url,
      key,
      `posts?id=eq.${encodeURIComponent(check.id)}&select=id`,
      key,
      fetchImpl,
    );
    return rows != null && rows.length === 0;
  }

  if (check.kind === "profile" || check.kind === "public-card") {
    const username = normalizeUsername(check.username);
    if (!USERNAME.test(username)) return true;
    if (check.kind === "public-card" && !isUuid(check.id)) return true;
    const profileRead = restRows(
      url,
      key,
      `profiles?username=eq.${encodeURIComponent(username)}&select=id`,
      key,
      fetchImpl,
    );
    // The card read does not wait for the profile. The owner check runs after.
    const cardRead =
      check.kind === "public-card"
        ? restRows(
            url,
            key,
            `public_cards?id=eq.${encodeURIComponent(check.id)}&select=user_id`,
            key,
            fetchImpl,
          )
        : null;
    const [profiles, cards] = await Promise.all([profileRead, cardRead]);
    if (profiles == null) return false;
    const profileId = profiles[0]?.id;
    if (!profileId) return true;
    if (check.kind === "profile") return false;
    if (cards == null) return false;
    return cards[0]?.user_id !== profileId;
  }

  if (check.kind === "card-posts") {
    const publicRows = await restRows(
      url,
      key,
      `public_cards?id=eq.${encodeURIComponent(check.id)}&select=id`,
      key,
      fetchImpl,
    );
    if (publicRows == null || publicRows.length > 0) return false;
    if (session === "unknown") return false;
    if (session === "anonymous") return true;
    const owned = await restRows(
      url,
      key,
      `cards?id=eq.${encodeURIComponent(check.id)}&select=id`,
      session.token,
      fetchImpl,
    );
    return owned != null && owned.length === 0;
  }

  // /cards/:id and /cards/:id/edit always render. A new card may not be
  // inserted yet, and a signed-out visit must reach AppShell so it can send
  // the visitor to /login?next=… Signed-in non-owners hit requireCardPageAccess.
  return false;
}
