import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./client";

export function createSupabaseBrowser() {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createBrowserClient(url, anonKey);
}
