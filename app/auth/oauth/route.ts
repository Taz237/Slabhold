import { NextResponse, type NextRequest } from "next/server";
import {
  DELETE_PENDING_COOKIE,
  flowCookieOptions,
  isDeleteResume,
  oauthFlowCookies,
} from "@/lib/account/apple-delete-flow";
import { needsHandle, oauthLandingPath } from "@/lib/auth/oauth";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Continue with Apple / Google lands here (on the web, and in the iOS app's
 * WebView after /auth/app-return). Swaps the PKCE code for a session, then
 * goes on to `next`. A new account picks its @handle first.
 *
 * When an account delete is waiting on Apple (see lib/account/apple-delete-flow),
 * this is the one moment the Apple token exists: it goes into a short-lived
 * httpOnly cookie for the delete route. Never into the URL or a log.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const go = (input: { ok: boolean; needsHandle?: boolean; next?: string | null }) =>
    NextResponse.redirect(
      new URL(
        oauthLandingPath({ next: input.next === undefined ? next : input.next, ok: input.ok, needsHandle: input.needsHandle ?? false }),
        url.origin,
      ),
    );

  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("error")) return go({ ok: false });
  const supabase = await createSupabaseServer();
  if (!supabase) return go({ ok: false });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go({ ok: false });
  const handle = needsHandle(data.user);
  // A brand-new account has nothing to delete: it never lands on the delete resume.
  const response = go({ ok: true, needsHandle: handle, next: handle && isDeleteResume(next) ? null : next });
  const cookies = oauthFlowCookies({
    pendingRaw: request.cookies.get(DELETE_PENDING_COOKIE)?.value,
    userId: data.user?.id,
    session: data.session,
  });
  for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, flowCookieOptions(cookie));
  return response;
}
