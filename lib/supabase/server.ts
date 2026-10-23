import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./client";

/**
 * Cookie-backed Supabase client for Route Handlers / Server Components.
 * Use getUser() or getClaims() — never getSession() — to verify login.
 */
export async function createSupabaseServer() {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // set from a Server Component without mutable cookies — middleware refreshes sessions
        }
      },
    },
  });
}

/** Verified auth user. createdAt is auth.users.created_at, not profiles.created_at. */
export async function getAuthUser(): Promise<{ id: string; createdAt: string | null } | null> {
  const supabase = await createSupabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return { id: data.user.id, createdAt: data.user.created_at ?? null };
}

/** Verified user id, or null if logged out / Supabase unconfigured. */
export async function getAuthUserId(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.id ?? null;
}

/** auth.users.created_at for the signed-in user. Null when logged out. */
export async function getAuthUserCreatedAt(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.createdAt ?? null;
}
