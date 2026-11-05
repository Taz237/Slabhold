import { NextResponse, type NextRequest } from "next/server";
import { appSchemeReturn } from "@/lib/auth/oauth";

/**
 * The iOS app's sign-in return. It's a universal link, so normally the app
 * opens and this never runs. If the in-app browser loads it anyway, hand the
 * same query to the app's own scheme. The app finishes on /auth/oauth.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(appSchemeReturn(request.nextUrl.search));
}
