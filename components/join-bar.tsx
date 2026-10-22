"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { loginPath, pathWithQuery, signupPath } from "@/lib/auth/safe-next";

export function JoinBarView({ pathname }: { pathname: string }) {
  return (
    <div
      data-join-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-[var(--background)] dark:border-white/10"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-sm font-semibold">Join Slabhold</p>
        <div className="flex items-center gap-2">
          <Link href={loginPath(pathname)} className="px-2 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
            Log in
          </Link>
          <Link
            href={signupPath(pathname)}
            className="rounded-full bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

export function JoinBar() {
  const pathname = usePathname() || "/";
  return (
    <Suspense fallback={<JoinBarView pathname={pathname} />}>
      <JoinBarLinks pathname={pathname} />
    </Suspense>
  );
}

function JoinBarLinks({ pathname }: { pathname: string }) {
  const search = useSearchParams().toString();
  return <JoinBarView pathname={pathWithQuery(pathname, search)} />;
}
