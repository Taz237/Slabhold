"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Bell, Camera, CircleUser, Compass, Ellipsis, Mail, Search, WalletCards } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { AccountDeletedToast } from "@/components/account-deleted-toast";
import { CreateMenu } from "@/components/create-menu";
import { JoinBar } from "@/components/join-bar";
import { LandingPage } from "@/components/landing-page";
import { isAuthPage, shouldShowJoinBar } from "@/lib/auth/guest-paths";
import { clearLogoutHome, logoutHomePending } from "@/lib/auth/logout-home";
import { requiresAccount, routeAccess } from "@/lib/auth/route-access";
import { loginPath, pathWithQuery } from "@/lib/auth/safe-next";
import type { Profile } from "@/lib/social/types";
import {
  activeTabAction,
  isCurrentTabScreen,
  keepsBrowserTabGesture,
  requestPageRefresh,
} from "@/lib/ui/pull-refresh";

const TABS = [
  { href: "/profile", label: "Profile", icon: CircleUser },
  { href: "/", label: "Home", icon: Compass },
  { href: "/cards/new", label: "Add card", icon: Camera },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/collection", label: "Collection", icon: WalletCards },
  { href: "/more", label: "More", icon: Ellipsis },
] as const;

function profileUsernameFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/u/")) return null;
  const segment = pathname.split("/")[2];
  return segment ? decodeURIComponent(segment) : null;
}

function isActive(pathname: string, href: string, user: Profile | null) {
  if (href === "/") return pathname === "/";
  if (href === "/profile") {
    if (pathname.startsWith("/profile")) return true;
    const routeUsername = profileUsernameFromPath(pathname);
    if (!routeUsername || !user) return false;
    return routeUsername.toLowerCase() === user.username.toLowerCase();
  }
  if (href === "/collection") {
    const addingCard = pathname === "/cards/new" || pathname.startsWith("/cards/new/");
    return (
      !addingCard &&
      (pathname.startsWith("/collection") ||
        pathname.startsWith("/portfolio") ||
        pathname.startsWith("/cards"))
    );
  }
  if (href === "/more") return pathname.startsWith("/more") || pathname === "/login";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Shell({
  children,
  unreadCount,
  unreadMessageCount,
  status,
  user,
  showNav,
  showJoin,
}: {
  children: React.ReactNode;
  unreadCount: number;
  unreadMessageCount: number;
  status: string | null;
  user: Profile | null;
  showNav: boolean;
  showJoin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  /** Collection needs a wider desktop column; feed/timeline stay max-w-lg. */
  const wideMain =
    pathname.startsWith("/collection") || pathname.startsWith("/portfolio");
  const mainMax = wideMain ? "max-w-5xl" : "max-w-lg";
  const mainPad = showNav
    ? "pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-[calc(10rem+env(safe-area-inset-bottom))]"
    : showJoin
      ? "pb-[calc(5.25rem+env(safe-area-inset-bottom))]"
      : "pb-[max(1.5rem,env(safe-area-inset-bottom))]";

  return (
    <div className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,92,255,0.16),_transparent_50%)]" />
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl dark:border-white/10">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 rounded-md py-1">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
          </Link>
          {showNav ? (
            <div className="flex items-center gap-1">
              <Link
                href="/notifications"
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                aria-current={pathname === "/notifications" ? "page" : undefined}
                className={`relative grid h-9 w-9 place-items-center rounded-full ${
                  pathname === "/notifications"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute top-0 right-0 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/search"
                aria-label="Search"
                aria-current={pathname === "/search" ? "page" : undefined}
                className={`grid h-9 w-9 place-items-center rounded-full ${
                  pathname === "/search"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                }`}
              >
                <Search className="h-5 w-5" />
              </Link>
            </div>
          ) : null}
        </div>
      </header>
      {status ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {status}
        </p>
      ) : null}
      <main className={`relative mx-auto w-full ${mainMax} px-4 py-5 ${mainPad}`}>
        {children}
      </main>
      {showNav ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-xl dark:border-white/10">
          <div className="mx-auto flex max-w-lg items-end justify-between px-1 pt-1 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href, user);
              const Icon = tab.icon;
              const onTabClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (
                  keepsBrowserTabGesture({
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                  })
                ) {
                  return;
                }
                if (!isCurrentTabScreen(pathname, tab.href, user?.username ?? null)) return;
                event.preventDefault();
                const top = window.scrollY || document.documentElement.scrollTop || 0;
                const action = activeTabAction({ onThisScreen: true, scrollTop: top });
                if (action === "scroll-top") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                if (!requestPageRefresh()) router.refresh();
              };
              if (tab.href === "/cards/new") {
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={onTabClick}
                    aria-label="Add card"
                    aria-current={active ? "page" : undefined}
                    className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] font-medium leading-none text-violet-700 dark:text-violet-200"
                  >
                    <span className="grid h-11 w-11 -translate-y-3 place-items-center rounded-full bg-violet-600 text-white shadow-lg ring-4 ring-[var(--background)]">
                      <Camera className="h-5 w-5" />
                    </span>
                    Add card
                  </Link>
                );
              }
              const messageBadge = tab.href === "/messages" ? unreadMessageCount : 0;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={onTabClick}
                  aria-label={
                    messageBadge > 0 ? `Messages, ${messageBadge} unread` : tab.label
                  }
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] font-medium leading-none ${
                    active ? "text-zinc-900 dark:text-white" : "text-zinc-500"
                  }`}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" />
                    {messageBadge > 0 ? (
                      <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {messageBadge > 9 ? "9+" : messageBadge}
                      </span>
                    ) : null}
                  </span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      {showJoin ? <JoinBar /> : null}
      {showNav ? <CreateMenu key={pathname} /> : null}
    </div>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,92,255,0.16),_transparent_50%)]" />
      <main className="relative mx-auto w-full max-w-lg px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}

function shellShowsPageWhileLoading(pathname: string) {
  if (routeAccess(pathname) === "unknown") return true;
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const path = cut.length > 1 && cut.endsWith("/") ? cut.slice(0, -1) : cut || "/";
  return path === "/mail-day";
}

function GuestGate() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--background)]" />}>
      <GuestRedirect />
    </Suspense>
  );
}

function GuestRedirect() {
  const pathname = usePathname() || "/";
  const search = useSearchParams().toString();
  const path = pathWithQuery(pathname, search);
  const router = useRouter();

  useEffect(() => {
    if (logoutHomePending()) {
      router.replace("/");
      return;
    }
    router.replace(loginPath(path));
  }, [path, router]);

  return <div className="min-h-dvh bg-[var(--background)]" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { unreadCount, unreadMessageCount, ready, user, status } = useSocial();

  useEffect(() => {
    if (!user && pathname === "/") clearLogoutHome();
  }, [user, pathname]);

  if (!ready) {
    if (shellShowsPageWhileLoading(pathname)) {
      return (
        <>
          <AccountDeletedToast />
          <Shell
            unreadCount={0}
            unreadMessageCount={0}
            status={null}
            user={null}
            showNav={false}
            showJoin={false}
          >
            {children}
          </Shell>
        </>
      );
    }
    // Leaving a cold post page reloads the site snapshot. Keep the header and
    // tabs up, with the page's own loading state in the main column.
    if (user) {
      return (
        <>
          <AccountDeletedToast />
          <Shell
            unreadCount={unreadCount}
            unreadMessageCount={unreadMessageCount}
            status={status}
            user={user}
            showNav
            showJoin={false}
          >
            {children}
          </Shell>
        </>
      );
    }
    return (
      <>
        <AccountDeletedToast />
        <div className="min-h-dvh bg-[var(--background)]" />
      </>
    );
  }

  if (!user && pathname === "/") {
    return (
      <>
        <AccountDeletedToast />
        <LandingPage />
      </>
    );
  }

  if (!user && isAuthPage(pathname)) {
    return (
      <>
        <AccountDeletedToast />
        <AuthLayout>{children}</AuthLayout>
      </>
    );
  }

  if (!user && requiresAccount(pathname)) {
    return (
      <>
        <AccountDeletedToast />
        <GuestGate />
      </>
    );
  }

  const showNav = Boolean(user);
  const showJoin = shouldShowJoinBar(showNav, pathname);

  return (
    <>
      <AccountDeletedToast />
      <Shell
        unreadCount={unreadCount}
        unreadMessageCount={unreadMessageCount}
        status={status}
        user={user}
        showNav={showNav}
        showJoin={showJoin}
      >
        {children}
      </Shell>
    </>
  );
}
