import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { hasSessionCookie } from "@/lib/auth/session-hint";
import { isRouterRequest } from "./router-request";
import { createSupabaseServer } from "./server";

export type RequestViewer = {
  supabase: SupabaseClient;
  id: string;
  email: string;
  /** auth.users.created_at, for the value board's account-age minimum. */
  createdAt?: string | null;
};

/**
 * The signed-in viewer of a full page load, verified with getUser, with the
 * cookie client their reads go through. Null for a visit from inside the
 * app (the router asks for the page, and the browser already has the data),
 * for a request with no session cookie, and when the session doesn't verify.
 */
export async function requestViewer(): Promise<RequestViewer | null> {
  if (await isRouterRequest()) return null;
  const requestHeaders = await headers();
  if (!hasSessionCookie(requestHeaders.get("cookie") ?? "")) return null;
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, id: data.user.id, email: data.user.email ?? "", createdAt: data.user.created_at ?? null };
}
