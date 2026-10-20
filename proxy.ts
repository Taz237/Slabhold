import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pathIsMissing } from "@/lib/social/missing-route";

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>Not found</h1><p>That page isn't on Slabhold.</p></body></html>`;

export async function proxy(request: NextRequest) {
  const missing = await pathIsMissing({
    pathname: request.nextUrl.pathname,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: request.cookies.getAll(),
  });
  if (!missing) return NextResponse.next();
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
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
