import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./client";

/**
 * Server-only Supabase client for sold_comps_cache / rate-limit reads & writes.
 * Requires SUPABASE_SERVICE_ROLE_KEY — never fall back to the anon key (RLS blocks it).
 */
export function createSupabaseAdmin(): SupabaseClient | null {
  const { url, configured } = getSupabaseConfig();
  if (!configured) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
