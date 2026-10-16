import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./client";

/**
 * Server-only Supabase client for sold_comps_cache reads/writes.
 * Prefers SUPABASE_SERVICE_ROLE_KEY (required for cache writes under RLS).
 */
export function createSupabaseAdmin(): SupabaseClient | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
