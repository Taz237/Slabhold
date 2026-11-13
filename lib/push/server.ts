import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { apnsConfig, apnsConfigProblems, type ApnsConfig } from "./apns-config";
import { createApnsSender, type ApnsSender } from "./apns";
import { pushServerConfig } from "./config";
import type { Dispatcher } from "./dispatch";
import type { WebPushSender } from "./send";
import { supabasePushStore } from "./supabase-store";

/**
 * The signed-in user: a Supabase access token in `Authorization: Bearer`,
 * else the session cookie. Never an id from the body.
 */
export async function requestUserId(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (token) {
    const { url, anonKey, configured } = getSupabaseConfig();
    if (!configured) return null;
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user?.id ? null : data.user.id;
  }
  return getAuthUserId();
}

let apnsCache: { fingerprint: string; config: ApnsConfig | null; sender: ApnsSender | null } | null = null;

/**
 * The APNs key parsed once per instance, and one sender per key, so the
 * provider token is reused for ~40 minutes (Apple throttles token churn).
 */
function apnsState() {
  const env = process.env;
  const fingerprint = createHash("sha256")
    .update([env.APNS_KEY_ID, env.APNS_TEAM_ID, env.APNS_BUNDLE_ID, env.APNS_PRIVATE_KEY].map((v) => v ?? "").join("\0"))
    .digest("hex");
  if (apnsCache?.fingerprint !== fingerprint) {
    const config = apnsConfig(env);
    // Once per server instance: why iPhone push is off. Setting names only.
    if (!config) console.warn(`[push] apns off: ${apnsConfigProblems(env).join(", ")}`);
    apnsCache = { fingerprint, config, sender: config ? createApnsSender(config) : null };
  }
  return apnsCache;
}

/**
 * Null when push is off: no VAPID keys and no APNs key, or no service-role
 * key. Every caller then no-ops. Each channel sends only when its own config
 * is set.
 */
export function pushDispatcher(): Dispatcher | null {
  const config = pushServerConfig();
  const apns = apnsState().sender;
  if (!config && !apns) return null;
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  return {
    store: supabasePushStore(admin, { apns: Boolean(apns) }),
    sender: webpush as unknown as WebPushSender,
    config,
    apns,
  };
}

/** Web push (VAPID) works right now. Unchanged by APNs. */
export function pushAvailable(): boolean {
  return pushServerConfig() !== null && createSupabaseAdmin() !== null;
}

/** The APNs key is set and the server can write. The table check is the route's. */
export function apnsConfigured(): boolean {
  return apnsState().config !== null && createSupabaseAdmin() !== null;
}
