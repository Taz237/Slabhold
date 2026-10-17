import { runAccountDelete, type AccountAdmin } from "@/lib/account/delete-account";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delete the signed-in account. The user id comes from getUser(), never the body.
 */
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const sessionUserId = await getAuthUserId();
  const admin = sessionUserId ? createSupabaseAdmin() : null;
  const result = await runAccountDelete({
    sessionUserId,
    body,
    admin: admin as unknown as AccountAdmin | null,
  });
  return Response.json(result.body, { status: result.status });
}
