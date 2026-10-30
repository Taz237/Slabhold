"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, ViewTransition, useEffect, useState } from "react";
import { Bell, Camera, Compass, Mail, Search, Trophy, WalletCards } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { AccountDeletedToast } from "@/components/account-deleted-toast";
import { GuestAccount } from "@/components/guest-account";
import { JoinBar } from "@/components/join-bar";
import { NavMotion } from "@/components/nav-motion";
import { NavPendingSkeleton } from "@/components/nav-pending-skeleton";
import { useOnboardingBusy } from "@/components/onboarding/use-onboarding";
import { preloadOnHint, sessionHinted } from "@/lib/auth/session-hint";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";
import {
  isAuthPage,
  isChromelessPath,
  isInvitePage,
  isJoinBarPage,
  loadingShellFor,
  shouldShowJoinBar,
} from "@/lib/auth/guest-paths";
import { clearLogoutHome, logoutHomePending } from "@/lib/auth/logout-home";
import { requiresAccount, seedsViewer } from "@/lib/auth/route-access";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { listenForInstallPrompt } from "@/lib/pwa/install-prompt";
import { loginPath, pathWithQuery } from "@/lib/auth/safe-next";
import type { TourTarget } from "@/lib/onboarding/first-run";
import type { Profile } from "@/lib/social/types";
import { BOTTOM_NAV } from "@/lib/ui/bottom-nav";
import {
  activeTabAction,
  isCurrentTabScreen,
  keepsBrowserTabGesture,
  requestPageRefresh,
} from "@/lib/ui/pull-refresh";

/*
 * The signed-in chrome loads in its own chunks. Signed-out Home renders none
 * of it, so it never downloads it. A visitor's header slot (Log in) is the
 * small static GuestAccount, so public pages draw the same on the server.
 */
const AccountMenu = lazyPart(() => import("@/components/side-menu").then((mod) => mod.AccountMenu), AccountSlot);
const CreateMenu = lazyPart(() => import("@/components/create-menu").then((mod) => mod.CreateMenu));
const FirstRunSetup = lazyPart(() => import("@/components/onboarding/first-run-setup").then((mod) => mod.FirstRunSetup));
const YoureIn = lazyPart(() => import("@/components/onboarding/youre-in").then((mod) => mod.YoureIn));
const CoachTour = lazyPart(() => import("@/components/onboarding/coach-tour").then((mod) => mod.CoachTour));
const BadgeRevealGate = lazyPart(() => import("@/components/badges/badge-reveal").then((mod) => mod.BadgeRevealGate));
const PushManager = lazyPart(() => import("@/components/push/push-manager").then((mod) => mod.PushManager));

/**
 * Push (worker, soft-ask, badge, notification taps) for a signed-in reader.
 * Its chunk loads only after the first idle moment, never for visitors.
 */
function PushAfterIdle({ user }: { user: Profile }) {
  const [idle, setIdle] = useState(false);
  useEffect(() => afterFirstIdle(() => setIdle(true)), []);
  return idle ? <PushManager user={user} /> : null;
}

/** The avatar's room while the menu's chunk loads. */
function AccountSlot() {
  return <span aria-hidden className="h-11 w-11" />;
}

// A session cookie means the chrome is coming: fetch what the first signed-in
// frame draws now, while the page hydrates and the snapshot loads. The
// onboarding overlays wait for the first idle moment so they don't compete
// with the feed for the main thread.
if (sessionHinted()) {
  // A screen the server drew already has its first frame. Its menus wait for
  // the first idle moment, so they don't compete with that paint.
  const preloadMenus = () => {
    for (const part of [AccountMenu, CreateMenu]) void part.preload().catch(() => {});
  };
  if (preloadOnHint()) preloadMenus();
  else afterFirstIdle(preloadMenus);
  afterFirstIdle(() => {
    for (const part of [FirstRunSetup, YoureIn, CoachTour, BadgeRevealGate]) void part.preload().catch(() => {});
  });
}

const TAB_ICONS = {
  "/": Compass,
  "/leaderboard": Trophy,
  "/cards/new": Camera,
  "/collection": WalletCards,
  "/messages": Mail,
} as const;

/** Coach-mark anchors for the quick tour. Home has none. */
const TAB_TOUR: Partial<Record<(typeof BOTTOM_NAV)[number]["href"], TourTarget>> = {
  "/leaderboard": "leaderboard",
  "/cards/new": "add-card",
  "/collection": "collection",
  "/messages": "messages",
};

const TABS = BOTTOM_NAV.map((tab) => ({
  href: tab.href,
  label: tab.label,
  icon: TAB_ICONS[tab.href],
  tour: TAB_TOUR[tab.href],
}));

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
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The page column. Keyed by route so each page change slides or fades
 * (see globals.css). The keyed transition is this component's only child.
 */
function PageFrame({
  pathname,
  className,
  children,
}: {
  pathname: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
      <main
        data-page=""
        className={`relative mx-auto min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-full px-4 py-5 ${className}`}
      >
        {children}
      </main>
    </ViewTransition>
  );
}

/** The header's bottom hairline. A shadow, so it never adds to the 52px row. */
const HEADER_HAIRLINE = "shadow-[inset_0_-1px_0_rgba(228,228,231,0.8)] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]";

function Shell({
  children,
  unreadCount,
  unreadMessageCount,
  status,
  user,
  showNav,
  showJoin,
  showLogin,
  reserveJoin = false,
  attachedTabs = false,
  chromeless = false,
  pending = false,
}: {
  children: React.ReactNode;
  unreadCount: number;
  unreadMessageCount: number;
  status: string | null;
  user: Profile | null;
  showNav: boolean;
  showJoin: boolean;
  /** Signed-out visitors get Log in at the top left once the session is known. */
  showLogin: boolean;
  /** Keep the join bar's room while the session loads, so its arrival moves nothing. */
  reserveJoin?: boolean;
  /** Home: the For You / Following tabs sit flush under the header and carry its hairline. */
  attachedTabs?: boolean;
  /** The composer: a full-screen sheet with no header, tabs, create menu or join bar. */
  chromeless?: boolean;
  /**
   * Drawn before the snapshot: CSS keeps it hidden unless the page read its
   * viewer on the server ([data-seeded-viewer], see globals.css).
   */
  pending?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = useSocial();
  const onboardingBusy = useOnboardingBusy();
  /** Collection needs a wider desktop column; feed/timeline stay max-w-lg. */
  const wideMain =
    pathname.startsWith("/collection") || pathname.startsWith("/portfolio");
  const mainMax = wideMain ? "max-w-5xl" : "max-w-lg";
  const mainPad = chromeless
    ? ""
    : showNav
      ? "pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-[calc(10rem+env(safe-area-inset-bottom))]"
      : showJoin || reserveJoin
        ? "pb-[calc(5.25rem+env(safe-area-inset-bottom))]"
        : "pb-[max(1.5rem,env(safe-area-inset-bottom))]";

  return (
    <div
      data-pending-shell={pending ? "" : undefined}
      className="min-h-full bg-[var(--background)] text-[var(--foreground)]"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,92,255,0.16),_transparent_50%)]" />
      {!chromeless ? (
        <header
          style={{ viewTransitionName: "app-header" }}
          data-attached-tabs={attachedTabs ? "" : undefined}
          className={`sticky top-0 z-20 bg-[var(--chrome-bg)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 ${
            attachedTabs ? "" : HEADER_HAIRLINE
          }`}>
          <div className="mx-auto grid h-[3.25rem] max-w-lg grid-cols-[1fr_auto_1fr] items-center px-4">
            <div className="flex items-center justify-self-start">
              {user ? <AccountMenu user={user} showLogin={showLogin} /> : <GuestAccount showLogin={showLogin} />}
            </div>
            <Link
              href="/"
              aria-label="Slabhold home"
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
            >
              <Logo className="h-8 w-8" />
            </Link>
            {showNav ? (
              <div className="flex items-center gap-1 justify-self-end">
                <Link
                  href="/notifications"
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                  aria-current={pathname === "/notifications" ? "page" : undefined}
                  className={`tap relative grid h-9 w-9 place-items-center rounded-full ${
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
                  className={`tap grid h-9 w-9 place-items-center rounded-full ${
                    pathname === "/search"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                  }`}
                >
                  <Search className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              <span aria-hidden />
            )}
          </div>
        </header>
      ) : null}
      {status ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {status}
        </p>
      ) : null}
      <PageFrame pathname={pathname} className={`${mainMax} ${mainPad}`}>
        {children}
      </PageFrame>
      <NavMotion />
      <NavPendingSkeleton />
      {showNav && !chromeless ? (
        <nav
          style={{ viewTransitionName: "app-nav" }}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-xl dark:border-white/10">
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
                    data-tour={tab.tour}
                    aria-label="Add card"
                    aria-current={active ? "page" : undefined}
                    className="tap flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] font-medium leading-none text-violet-700 dark:text-violet-200"
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
                  data-tour={tab.tour}
                  aria-label={
                    messageBadge > 0 ? `Messages, ${messageBadge} unread` : tab.label
                  }
                  aria-current={active ? "page" : undefined}
                  className={`tap relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] font-medium leading-none ${
                    active ? "text-zinc-900 dark:text-white" : "text-zinc-500"
                  }`}
                >
                  <span className="relative">
                    <Icon
                      className={`h-5 w-5 ${
                        active && tab.href === "/leaderboard"
                          ? "text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.95)]"
                          : ""
                      }`}
                    />
                    {messageBadge > 0 ? (
                      <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--background)]">
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
      {showJoin && !chromeless ? <JoinBar /> : null}
      {showNav && !chromeless ? <CreateMenu key={pathname} /> : null}
      {user ? <FirstRunSetup /> : null}
      {user ? <YoureIn userId={user.id} username={user.username} /> : null}
      {user ? <CoachTour userId={user.id} /> : null}
      {user && mode === "supabase" && !onboardingBusy ? (
        <BadgeRevealGate userId={user.id} username={user.username} />
      ) : null}
      {user && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
        <PushAfterIdle key={user.id} user={user} />
      ) : null}
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
  const chromeless = isChromelessPath(pathname);

  useEffect(() => {
    if (!user && pathname === "/") clearLogoutHome();
  }, [user, pathname]);

  // The snapshot says nobody is signed in: drop a stale session hint.
  useEffect(() => {
    if (ready && !user) delete document.documentElement.dataset.session;
  }, [ready, user]);

  // Chrome can offer its install prompt before the Add to Home Screen step is up.
  useEffect(() => {
    listenForInstallPrompt();
  }, []);

  if (!ready) {
    const loading = loadingShellFor(pathname);
    const plainShell = (
      <>
        <AccountDeletedToast />
        <Shell
          unreadCount={0}
          unreadMessageCount={0}
          status={null}
          user={null}
          showNav={false}
          showJoin={false}
          showLogin={false}
          reserveJoin={loading === "shell" && isJoinBarPage(pathname)}
          chromeless={chromeless}
        >
          {children}
        </Shell>
      </>
    );
    if (loading === "plain" || loading === "chromeless") return plainShell;
    // Leaving a cold post page reloads the site snapshot. Keep the header and
    // tabs up, with the page's own loading state in the main column. Checked
    // before the signed-out paths so a known reader never sees guest chrome.
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
            showLogin={false}
            attachedTabs={pathname === "/"}
            chromeless={chromeless}
          >
            {children}
          </Shell>
        </>
      );
    }
    // Home, Collection and a card page read their viewer on the server, so
    // they draw signed in from the server HTML: the same shell the snapshot
    // brings, so the page under it never remounts. Without that read (a
    // visitor, a stale cookie) CSS hides it and these stay blank as before.
    if (getSupabaseConfig().configured && seedsViewer(pathname)) {
      return (
        <>
          <AccountDeletedToast />
          <Shell
            unreadCount={0}
            unreadMessageCount={0}
            status={null}
            user={null}
            showNav
            showJoin={false}
            showLogin={false}
            attachedTabs={pathname === "/"}
            chromeless={chromeless}
            pending
          >
            {children}
          </Shell>
        </>
      );
    }
    // Public pages draw at once: the server HTML and each page's own
    // skeleton. Nav or the join bar and Log in follow with the snapshot.
    if (loading === "shell") return plainShell;
    // Home draws its landing page itself, hidden by CSS while a session
    // cookie says someone is signed in (see lib/auth/session-hint.ts).
    if (loading === "bare") {
      return (
        <>
          <AccountDeletedToast />
          {children}
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

  // Home renders the landing page itself (HomeGate), with the founder showcase
  // the server already loaded. No header or tabs around it.
  if (!user && pathname === "/") {
    return (
      <>
        <AccountDeletedToast />
        {children}
      </>
    );
  }

  if (!user && isInvitePage(pathname)) {
    return (
      <>
        <AccountDeletedToast />
        {children}
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
        showLogin={!user}
        attachedTabs={pathname === "/"}
        chromeless={chromeless}
      >
        {children}
      </Shell>
    </>
  );
}
