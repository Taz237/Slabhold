import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LANDING_PATH, servesLanding } from "@/lib/auth/landing-route";
import { isStaticPublicPath } from "@/lib/auth/route-access";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { pathIsMissing } from "@/lib/social/missing-route";

export async function proxy(request: NextRequest) {
  // Signed-out Home is its own route, with none of the app's code.
  if (
    servesLanding({
      pathname: request.nextUrl.pathname,
      cookieHeader: request.headers.get("cookie") ?? "",
      supabaseConfigured: getSupabaseConfig().configured,
    })
  ) {
    return NextResponse.rewrite(new URL(LANDING_PATH, request.url));
  }
  // Install files, Next assets, and OG images are never missing-page checks.
  if (isStaticPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  const missing = await pathIsMissing({
    pathname: request.nextUrl.pathname,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: request.cookies.getAll(),
  });
  if (!missing) return NextResponse.next();
  // Rewrite onto the app 404 so Next renders not-found for documents and a
  // flight response the client router can read. A raw HTML body breaks RSC.
  return NextResponse.rewrite(new URL("/404", request.url), {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
    },
  });
}

export const config = {
  // Positive list only. / picks signed-out Home's route. Manifest, /icons, apple icons, favicon, robots,
  // /_next, and opengraph/twitter images are not matched.
  matcher: [
    "/",
    "/posts/:id",
    "/u/:username",
    "/u/:username/followers",
    "/u/:username/following",
    "/u/:username/cards/:id",
    "/cards/:id",
    "/cards/:id/edit",
    "/cards/:id/posts",
  ],
};
