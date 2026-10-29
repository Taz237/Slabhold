import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";

/**
 * Logged-out reader that never touches cookies, so pages and share images
 * that use it can be cached on the CDN. It sees only what anon RLS allows.
 */
export function createAnonReader(): SupabaseClient | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
