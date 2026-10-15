"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";

export function MoreView() {
  const router = useRouter();
  const { ready, user, signOut, mode, status } = useSocial();

  if (!ready) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows count={2} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">More</h1>
      <p className="mt-1 text-sm text-zinc-500">Account, settings, and shortcuts.</p>

      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h2 className="text-sm font-bold">Account</h2>
        {user ? (
          <div className="mt-3 flex items-center gap-3">
            <Avatar
              name={user.displayName}
              image={user.avatarDataUrl}
              accent={user.accent}
              className="h-12 w-12"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.displayName}</p>
              <p className="truncate text-sm text-zinc-500">@{user.username}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">You&apos;re browsing as a guest.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {user ? (
            <>
              <Link
                href="/profile"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
              >
                Edit profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => router.replace("/"));
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-white/15"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
              >
                Log in
              </Link>
              <Link
                href="/login?tab=signup"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-white/15"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h2 className="text-sm font-bold">Shortcuts</h2>
        <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-white/10">
          <li>
            <Link href="/scan" className="block py-3">
              Scan a card
            </Link>
          </li>
          <li>
            <Link href="/cards/new" className="block py-3">
              Add a card without a photo
            </Link>
          </li>
          <li>
            <Link href="/collection" className="block py-3">
              Open collection
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h2 className="text-sm font-bold">Appearance</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Slabhold follows your device light or dark mode.
        </p>
        {status ? (
          <p className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-400">{status}</p>
        ) : mode === "local" ? (
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Accounts are saved in this browser. Add Supabase keys in .env.local when you want
            hosted login.
          </p>
        ) : null}
      </section>
    </div>
  );
}
