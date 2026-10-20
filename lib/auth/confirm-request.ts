import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authConfirmFailurePath } from "@/lib/auth/password-reset";
import { safeNext } from "@/lib/auth/safe-next";
import { createSupabaseServer } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isOtpType(value: string): value is EmailOtpType {
  return OTP_TYPES.has(value as EmailOtpType);
}

/** Exchange a signup code or email token, then return to a safe next path. */
export async function handleAuthConfirm(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const type = url.searchParams.get("type");
  const success = NextResponse.redirect(new URL(next, url.origin));
  const fail = NextResponse.redirect(
    new URL(authConfirmFailurePath({ pathname: url.pathname, next, type }), url.origin),
  );
  const supabase = await createSupabaseServer();
  if (!supabase) return fail;

  if (url.searchParams.get("error") || url.searchParams.get("error_code")) return fail;

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? fail : success;
  }

  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash && type && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return error ? fail : success;
  }

  return fail;
}
