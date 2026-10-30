import "server-only";

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
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

/** Null when push is off (no VAPID keys or no service-role key). Every caller then no-ops. */
export function pushDispatcher(): Dispatcher | null {
  const config = pushServerConfig();
  if (!config) return null;
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  return {
    store: supabasePushStore(admin),
    sender: webpush as unknown as WebPushSender,
    config,
  };
}

export function pushAvailable(): boolean {
  return pushServerConfig() !== null && createSupabaseAdmin() !== null;
}
