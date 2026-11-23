import { NextResponse, type NextRequest } from "next/server";
import {
  APPLE_TOKEN_COOKIE,
  DELETE_PENDING_COOKIE,
  flowCookieOptions,
  handleAccountDelete,
} from "@/lib/account/apple-delete-flow";
import { appleRevokeConfig, revokeAppleToken } from "@/lib/account/apple-revoke";
import { usedAppleSignIn } from "@/lib/account/apple-sign-in";
import { runAccountDelete, type AccountAdmin } from "@/lib/account/delete-account";
import { flushValueBoardCache } from "@/lib/leaderboard/flush-cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delete the signed-in account. The user id comes from getUser(), never the body.
 * A Sign in with Apple login has its Apple token revoked first when that is
 * set up (lib/account/apple-delete-flow). A failed revoke never blocks the delete.
 */
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const sessionUserId = await getAuthUserId();
  const admin = sessionUserId ? createSupabaseAdmin() : null;
  // Read before the delete: afterwards the login is gone. A failed lookup only skips the Apple part.
  let apple = false;
  if (admin && sessionUserId) {
    try {
      const { data } = await admin.auth.admin.getUserById(sessionUserId);
      apple = usedAppleSignIn(data?.user);
    } catch {
      apple = false;
    }
  }
  const reply = await handleAccountDelete({
    sessionUserId,
    ready: !!admin,
    body,
    apple,
    revokeConfigured: apple && appleRevokeConfig() !== null,
    pendingRaw: request.cookies.get(DELETE_PENDING_COOKIE)?.value,
    tokenRaw: request.cookies.get(APPLE_TOKEN_COOKIE)?.value,
    revoke: (token, tokenTypeHint) => revokeAppleToken({ token, tokenTypeHint }),
    runDelete: () =>
      runAccountDelete({
        sessionUserId,
        body,
        admin: admin as unknown as AccountAdmin | null,
      }),
  });
  if (reply.status === 200 && reply.body.ok) {
    try {
      await flushValueBoardCache();
    } catch (error) {
      console.error(
        "[leaderboard] board refresh after delete failed",
        error instanceof Error ? error.message : "error",
      );
    }
  }
  // `apple` in the body: the screen then shows how to remove Slabhold from the person's Apple Account.
  const response = NextResponse.json(reply.body, { status: reply.status });
  for (const cookie of reply.cookies) response.cookies.set(cookie.name, cookie.value, flowCookieOptions(cookie));
  return response;
}
