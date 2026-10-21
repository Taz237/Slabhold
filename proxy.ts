import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pathIsMissing } from "@/lib/social/missing-route";

export async function proxy(request: NextRequest) {
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
  matcher: [
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
