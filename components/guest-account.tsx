"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { loginPath } from "@/lib/auth/safe-next";

/**
 * Top-left slot of the top bar for a visitor: Log in once the session is
 * known, nothing before. Its own small module, so public pages don't load
 * the side menu to draw it.
 */
export function GuestAccount({ showLogin }: { showLogin: boolean }) {
  const pathname = usePathname() || "/";
  if (!showLogin) return <span aria-hidden className="h-11 w-11" />;
  return (
    <Link
      href={loginPath(pathname)}
      className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold"
    >
      <span className="rounded-full bg-violet-600 px-3.5 py-1.5 text-white">Log in</span>
    </Link>
  );
}
