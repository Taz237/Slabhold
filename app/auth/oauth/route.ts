import { NextResponse, type NextRequest } from "next/server";
import { needsHandle, oauthLandingPath } from "@/lib/auth/oauth";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Continue with Apple / Google lands here (on the web, and in the iOS app's
 * WebView after /auth/app-return). Swaps the PKCE code for a session, then
 * goes on to `next`. A new account picks its @handle first.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const go = (input: { ok: boolean; needsHandle?: boolean }) =>
    NextResponse.redirect(
      new URL(oauthLandingPath({ next, ok: input.ok, needsHandle: input.needsHandle ?? false }), url.origin),
    );

  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("error")) return go({ ok: false });
  const supabase = await createSupabaseServer();
  if (!supabase) return go({ ok: false });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go({ ok: false });
  return go({ ok: true, needsHandle: needsHandle(data.user) });
}
