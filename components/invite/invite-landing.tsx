"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LineChart, UsersRound, WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { loginPath, signupPath } from "@/lib/auth/safe-next";
import { inviteStore, rememberInvite } from "@/lib/invites/attribution";
import { INVITE_CARD_LIMIT, type PublicCollector } from "@/lib/invites/public-collector";
import { userHref } from "@/lib/social/user-href";
import { SlabFan } from "./slab-fan";
import { usePublicCollector } from "./use-public-collector";

const primary =
  "flex h-14 w-full items-center justify-center rounded-full bg-[#7C3AED] px-6 text-[17px] font-semibold text-white shadow-[0_14px_40px_-12px_rgba(124,58,237,0.95)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] focus-visible:outline-none";

const POINTS = [
  { icon: WalletCards, text: "Track your collection with recent sold prices" },
  { icon: UsersRound, text: "Follow collectors and see their pickups" },
  { icon: LineChart, text: "Watch your collection's value over time" },
];

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.length > 0 && first.length <= 16 ? first : name.trim();
}

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;
}

/**
 * /i/<username>, signed out: who invited you, their top public cards, and one
 * button to join. The invite is remembered on this device for 7 days. An
 * unknown, reserved or private handle gets the same page with no one on it.
 */
export function InviteLanding({ handle, collector: server }: { handle: string | null; collector: PublicCollector | null }) {
  const router = useRouter();
  const { ready, user } = useSocial();
  const collector = usePublicCollector(handle, server, INVITE_CARD_LIMIT);
  const username = collector?.username ?? null;

  // Signed in already: their profile, with Follow right there.
  useEffect(() => {
    if (ready && user && username) router.replace(userHref(username));
  }, [ready, user, username, router]);

  useEffect(() => {
    if (!username) return;
    const store = inviteStore();
    if (store) rememberInvite(username, store);
  }, [username]);

  const next = username ? userHref(username) : "/";
  const name = collector?.displayName ?? "";
  const facts = collector
    ? [
        `@${collector.username}`,
        collector.followerCount != null ? count(collector.followerCount, "follower", "followers") : null,
        collector.publicCardCount != null && collector.publicCardCount > 0
          ? count(collector.publicCardCount, "public card", "public cards")
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div data-invite-landing="" className="min-h-dvh overflow-x-clip bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.32),_transparent_58%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-5xl">
        <header className="flex min-h-14 items-center justify-between">
          <Link href="/" aria-label="Slabhold home" className="flex min-h-11 items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none">
            <Logo className="h-8 w-8" />
            <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
          </Link>
          <Link
            href={loginPath(next)}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-zinc-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
          >
            Log in
          </Link>
        </header>

        <main className="mt-4 flex flex-1 flex-col lg:mt-14 lg:grid lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-14">
          <div className="lg:order-2">
            <SlabFan cards={collector?.cards ?? []} size="lg" />
          </div>

          <div className="mt-6 text-center lg:mt-0 lg:text-left">
            <p className="font-mono text-[12px] font-medium tracking-[0.18em] text-[#A78BFA] uppercase">You&apos;re invited</p>
            {collector ? (
              <>
                <div className="mt-4 flex items-center justify-center gap-3 lg:justify-start">
                  <Avatar
                    name={name}
                    image={collector.avatarUrl}
                    expandable={false}
                    className="h-14 w-14 text-base ring-2 ring-[#7C3AED]/70 ring-offset-2 ring-offset-[#09090b]"
                  />
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[17px] font-bold tracking-tight">{name}</p>
                    <p className="truncate text-[14px] text-zinc-400">{facts.join(" · ")}</p>
                  </div>
                </div>
                <h1 className="mt-5 text-[2.25rem] leading-[1.06] font-extrabold tracking-[-0.035em] text-white sm:text-5xl">
                  {name} invited you to Slabhold
                </h1>
              </>
            ) : (
              <h1 className="mt-4 text-[2.25rem] leading-[1.06] font-extrabold tracking-[-0.035em] text-white sm:text-5xl">
                You&apos;re invited to Slabhold
              </h1>
            )}
            <p className="mx-auto mt-3 max-w-sm text-[16px] leading-6 text-zinc-400 lg:mx-0">
              The home for your card collection, and the collectors you follow.
            </p>

            <div className="mt-7 space-y-2 lg:max-w-sm">
              <Link href={signupPath(next)} data-invite-join="" className={primary}>
                {collector ? `Join ${firstName(name)} on Slabhold` : "Join Slabhold"}
              </Link>
              <p className="text-center text-[15px] text-zinc-400">
                Already have an account?{" "}
                <Link href={loginPath(next)} className="hit-44 inline-flex items-center font-semibold text-white underline underline-offset-4">
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </main>

        <ul className="mt-10 space-y-2 lg:mx-auto lg:mt-16 lg:grid lg:w-full lg:grid-cols-3 lg:gap-3 lg:space-y-0">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#7C3AED]/20 text-[#A78BFA]">
                <Icon aria-hidden className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-medium text-zinc-200">{text}</span>
            </li>
          ))}
        </ul>

        <footer className="mt-auto flex gap-4 pt-10 text-sm text-zinc-400">
          <Link href="/privacy" className="hit-44 inline-flex items-center font-semibold underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="hit-44 inline-flex items-center font-semibold underline underline-offset-2">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
