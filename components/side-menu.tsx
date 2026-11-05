"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Award,
  Bell,
  Camera,
  Compass,
  FileText,
  Info,
  Link2,
  LogOut,
  Mail,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  SquarePlus,
  Tag,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { GuestAccount } from "@/components/guest-account";
import { AdminMenuLinks } from "@/components/admin-nav-link";
import { Badge, badgeLabel } from "@/components/badges/badge";
import { InstallGuide, useInstallPlatform, type GuidePlatform } from "@/components/onboarding/install-step";
import { useSocial } from "@/components/social-provider";
import { markLogoutHome } from "@/lib/auth/logout-home";
import { requestBadgeCheck } from "@/lib/badges/client";
import { startTour, writeInstallChoice } from "@/lib/onboarding/store";
import { installMenuShows } from "@/lib/pwa/install-step";
import { parsePin } from "@/lib/badges/pins";
import type { EarnedBadge } from "@/lib/badges/progress";
import { clearNewCardDraft } from "@/lib/cards/new-card-draft";
import { trapTabTarget } from "@/lib/social/collect-interests";
import type { Profile } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { useInviteShare } from "@/components/invite/invite-button";
import { quickCompEnabled } from "@/lib/quick-comp/flag";
import { sideMenuItems } from "@/lib/ui/side-menu-items";
import { edgeSwipeClaims } from "@/lib/ui/nav-motion";
import {
  ADD_TO_HOME_LABEL,
  INVITE_MENU_HREF,
  SIDE_MENU_SETTINGS,
  countLabel,
  dragOffset,
  menuDragProgress,
  menuEdgeSwipeAllowed,
  menuItemActive,
  menuQueryOpens,
  menuReleaseOpens,
  SIDE_MENU_MAX_PX,
  TAKE_TOUR_LABEL,
  TOUR_AFTER_CLOSE_MS,
} from "@/lib/ui/side-menu";

const ITEM_ICONS: Record<string, LucideIcon> = {
  "/profile": User,
  "/collection": WalletCards,
  "/achievements": Award,
  "/messages": Mail,
  "/comp": Tag,
  "/cards/new": Camera,
  "/leaderboard": Trophy,
  "/moving-today": TrendingUp,
  [INVITE_MENU_HREF]: UserPlus,
  "/settings/notifications": Bell,
  "/settings/privacy": ShieldCheck,
  "/settings/invite": Link2,
  "/settings/collecting": SlidersHorizontal,
  "/about": Info,
  "/privacy": FileText,
  "/terms": Scale,
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const mainRow =
  "tap-fade flex min-h-12 items-center gap-4 rounded-2xl px-3 text-[19px] font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none";
const settingsRow =
  "tap-fade flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none";

function rowTone(active: boolean) {
  return active
    ? "bg-[#7C3AED]/10 text-zinc-950 dark:bg-[#7C3AED]/20 dark:text-white"
    : "text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.06]";
}

function iconTone(active: boolean) {
  return active ? "text-[#7C3AED] dark:text-[#A78BFA]" : "";
}

const noopSubscribe = () => () => {};

/** False on the server and during hydration, so the portal never mismatches. */
function useOnClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

type BadgeSummary = { userId: string; label: string | null; pins: EarnedBadge[] };

/**
 * Top-left slot of the top bar. Signed in: your avatar, which opens the side
 * menu. Signed out: a Log in button. Nothing while the session loads.
 */
export function AccountMenu({ user, showLogin }: { user: Profile | null; showLogin: boolean }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const platform = useInstallPlatform();

  const openMenu = useCallback(() => {
    setOpen(true);
    setEverOpened(true);
  }, []);
  const closeMenu = useCallback(() => setOpen(false), []);
  /** Close first, so the guide doesn't open over the sliding menu. */
  const openGuide = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => setGuideOpen(true), TOUR_AFTER_CLOSE_MS);
  }, []);
  const pathname = usePathname() || "/";
  useMenuEdgeSwipe({ enabled: Boolean(user) && pathname === "/", panelId, open, onOpen: openMenu });

  if (!user) return <GuestAccount showLogin={showLogin} />;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        data-tour="menu"
        onClick={openMenu}
        className="-ml-1.5 grid h-11 w-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none"
      >
        <Avatar
          name={user.displayName}
          image={user.avatarDataUrl}
          accent={user.accent}
          expandable={false}
          className="h-8 w-8 text-[11px]"
        />
      </button>
      <Suspense fallback={null}>
        <MenuQueryOpener onOpen={openMenu} />
      </Suspense>
      <SideMenu
        id={panelId}
        user={user}
        open={open}
        mountExtras={everOpened}
        onClose={closeMenu}
        returnFocus={buttonRef}
        onAddToHome={installMenuShows(platform) ? openGuide : undefined}
      />
      {guideOpen && installMenuShows(platform) ? (
        <InstallGuide
          platform={platform as GuidePlatform}
          variant="menu"
          onDone={(choice) => {
            if (choice === "added") writeInstallChoice(user.id, "added");
            setGuideOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** Drawer and backdrop slide time (side-menu panel classes use the same). */
const MENU_SLIDE_MS = 300;

/** Another dialog on screen. The closed menu is inert, so it never counts. */
function otherModalOpen() {
  return [...document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")].some(
    (dialog) => !dialog.closest("[inert]") && getComputedStyle(dialog).visibility !== "hidden",
  );
}

type MenuParts = { wrap: HTMLElement; panel: HTMLElement; backdrop: HTMLElement };

/**
 * Home only: a sideways drag from the left edge pulls the menu out. The panel
 * follows the finger (translate), the backdrop fades with it, and letting go
 * snaps open or shut. Other pages keep that edge for the back swipe.
 */
function useMenuEdgeSwipe({
  enabled,
  panelId,
  open,
  onOpen,
}: {
  enabled: boolean;
  panelId: string;
  open: boolean;
  onOpen: () => void;
}) {
  const openRef = useRef(open);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = open;
    onOpenRef.current = onOpen;
  }, [open, onOpen]);

  useEffect(() => {
    if (!enabled) return;
    let tracking = false;
    let claimed = false;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let width = SIDE_MENU_MAX_PX;
    let frame = 0;
    let settleTimer = 0;
    let samples: Array<{ x: number; t: number }> = [];
    let parts: MenuParts | null = null;

    function find(): MenuParts | null {
      const panel = document.getElementById(panelId);
      const backdrop = panel?.previousElementSibling;
      const wrap = panel?.parentElement;
      if (!panel || !(backdrop instanceof HTMLElement) || !wrap) return null;
      return { wrap, panel, backdrop };
    }

    function clear(target: MenuParts | null) {
      if (!target) return;
      for (const el of [target.wrap, target.panel, target.backdrop]) {
        el.style.removeProperty("transition");
        el.style.removeProperty("visibility");
        el.style.removeProperty("translate");
        el.style.removeProperty("opacity");
      }
    }

    function paint() {
      frame = 0;
      if (!parts) return;
      const progress = menuDragProgress(deltaX, width);
      parts.panel.style.translate = `${(progress - 1) * 100}% 0`;
      parts.backdrop.style.opacity = String(progress);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(paint);
    }

    /** Mount the panel at the edge, off screen, ready to follow the finger. */
    function arm(): boolean {
      window.clearTimeout(settleTimer);
      clear(parts);
      parts = find();
      if (!parts) return false;
      width = parts.panel.getBoundingClientRect().width || width;
      parts.wrap.style.visibility = "visible";
      for (const el of [parts.wrap, parts.panel, parts.backdrop]) el.style.transition = "none";
      paint();
      return true;
    }

    function settle(opens: boolean) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      const target = parts;
      if (!target) return;
      // Hand the transition back to the classes, then aim at where they will sit.
      target.panel.style.removeProperty("transition");
      target.backdrop.style.removeProperty("transition");
      target.panel.style.translate = opens ? "0 0" : "-100% 0";
      target.backdrop.style.opacity = opens ? "1" : "0";
      if (opens) onOpenRef.current();
      settleTimer = window.setTimeout(() => {
        clear(target);
        if (parts === target) parts = null;
      }, MENU_SLIDE_MS + 20);
    }

    function stopWatching() {
      window.removeEventListener("touchmove", onEdgeMove);
    }

    function onEdgeStart(event: TouchEvent) {
      stopWatching();
      tracking = false;
      claimed = false;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (
        !menuEdgeSwipeAllowed({
          pathname: window.location.pathname,
          startX: touch.clientX,
          menuOpen: openRef.current,
          modalOpen: otherModalOpen(),
        })
      ) {
        return;
      }
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
      deltaX = 0;
      samples = [{ x: touch.clientX, t: event.timeStamp }];
      window.addEventListener("touchmove", onEdgeMove, { passive: false });
    }

    function onEdgeMove(event: TouchEvent) {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!claimed) {
        const decision = edgeSwipeClaims(dx, dy);
        if (decision === "release") {
          tracking = false;
          stopWatching();
          return;
        }
        if (decision === "wait" || !arm()) return;
        claimed = true;
      }
      if (event.cancelable) event.preventDefault();
      deltaX = dx;
      samples.push({ x: touch.clientX, t: event.timeStamp });
      if (samples.length > 5) samples.shift();
      schedule();
    }

    function onEdgeEnd() {
      stopWatching();
      if (!tracking) return;
      tracking = false;
      if (!claimed) return;
      claimed = false;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = first && last ? last.t - first.t : 0;
      const velocity = first && last && elapsed > 0 ? (last.x - first.x) / elapsed : 0;
      settle(menuReleaseOpens({ progress: menuDragProgress(deltaX, width), velocity, wasOpen: false }));
    }

    window.addEventListener("touchstart", onEdgeStart, { passive: true });
    window.addEventListener("touchend", onEdgeEnd);
    window.addEventListener("touchcancel", onEdgeEnd);
    return () => {
      stopWatching();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("touchstart", onEdgeStart);
      window.removeEventListener("touchend", onEdgeEnd);
      window.removeEventListener("touchcancel", onEdgeEnd);
      clear(parts);
    };
  }, [enabled, panelId]);
}

/** /more redirects to /?menu=open. Open the menu, then drop the param. */
function MenuQueryOpener({ onOpen }: { onOpen: () => void }) {
  const params = useSearchParams();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const search = params.toString();
  const wants = menuQueryOpens(search);

  useEffect(() => {
    if (!wants) return;
    onOpen();
    const rest = new URLSearchParams(search);
    rest.delete("menu");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [wants, search, pathname, onOpen, router]);

  return null;
}

/**
 * X-style side menu. Slides in from the left over a dimmed page. Closes on
 * the backdrop, a swipe left, Escape, or picking an item. Focus stays inside
 * and the page does not scroll while it is open.
 */
export function SideMenu({
  id,
  user,
  open,
  mountExtras,
  onClose,
  returnFocus,
  onAddToHome,
}: {
  id: string;
  user: Profile;
  open: boolean;
  /** Admin check and the like wait for the first open. */
  mountExtras: boolean;
  onClose: () => void;
  returnFocus?: React.RefObject<HTMLElement | null>;
  /** Shown as "Add to Home Screen" when set: phones that haven't installed. */
  onAddToHome?: () => void;
}) {
  const onClient = useOnClient();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { mode, status, signOut, followerCount, followingCount, unreadMessageCount } = useSocial();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTouch = useRef<{ x: number; t: number } | null>(null);
  const [drag, setDrag] = useState<{ px: number; progress: number } | null>(null);
  const [badges, setBadges] = useState<BadgeSummary | null>(null);
  const userId = user.id;
  const hosted = mode === "supabase";
  const invite = useInviteShare(user.username);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Opening the menu checks badge progress, like More did.
  useEffect(() => {
    if (!open || !hosted) return;
    let cancelled = false;
    void requestBadgeCheck().then((result) => {
      if (cancelled) return;
      if (!result?.available) {
        setBadges({ userId, label: null, pins: [] });
        return;
      }
      const pins = result.showBadges
        ? result.pinned.flatMap((value) => parsePin(value) ?? []).slice(0, 3)
        : [];
      setBadges({ userId, label: `${result.earnedCount} / ${result.total}`, pins });
    });
    return () => {
      cancelled = true;
    };
  }, [open, hosted, userId]);

  // Keep focus inside, close on Escape, and lock page scroll.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusTarget = returnFocus?.current ?? null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    // The panel takes focus so no item shows a ring until you press Tab.
    panel?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const target = trapTabTarget(items.length, index, event.shiftKey);
      if (target === null) return;
      event.preventDefault();
      items[target]?.focus();
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      focusTarget?.focus();
    };
  }, [open, returnFocus]);

  if (!onClient) return null;

  const summary = badges?.userId === userId ? badges : null;
  const badgesHref = `${userHref(user.username)}/badges`;

  function logOut() {
    markLogoutHome();
    clearNewCardDraft();
    onClose();
    void signOut().then(() => router.replace("/"));
  }

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY, t: event.timeStamp } : null;
    lastTouch.current = touch ? { x: touch.clientX, t: event.timeStamp } : null;
  }

  function onTouchMove(event: React.TouchEvent) {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      const px = dragOffset(dx);
      const width = panelRef.current?.offsetWidth || SIDE_MENU_MAX_PX;
      setDrag({ px, progress: menuDragProgress(width + px, width) });
    }
    lastTouch.current = { x: touch.clientX, t: event.timeStamp };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    const recent = lastTouch.current;
    touchStart.current = null;
    lastTouch.current = null;
    setDrag(null);
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    // Snap like the edge swipe: 35% of the panel back, or a flick to the left.
    const width = panelRef.current?.offsetWidth || SIDE_MENU_MAX_PX;
    const from = recent && event.timeStamp - recent.t < 80 ? recent : { x: start.x, t: start.t };
    const elapsed = event.timeStamp - from.t;
    const velocity = elapsed > 0 ? (touch.clientX - from.x) / elapsed : 0;
    const progress = menuDragProgress(width + dragOffset(dx), width);
    if (!menuReleaseOpens({ progress, velocity, wasOpen: true })) onClose();
  }

  /** Close first, so the tour spotlights the real top bar and tabs. */
  function takeTour() {
    onClose();
    window.setTimeout(startTour, TOUR_AFTER_CLOSE_MS);
  }

  const items = sideMenuItems(quickCompEnabled()).filter((item) => item.href !== "/achievements" || hosted);

  return (
    <>
      {createPortal(
    <div
      className={`fixed inset-0 z-50 transition-[visibility] duration-300 motion-reduce:duration-0 ${
        open ? "visible" : "invisible"
      }`}
      inert={!open}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
        setDrag(null);
      }}
    >
      <div
        aria-hidden
        data-menu-backdrop=""
        onClick={onClose}
        style={drag !== null && open ? { opacity: drag.progress, transition: "none" } : undefined}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        style={drag !== null && open ? { transform: `translateX(${drag.px}px)`, transition: "none" } : undefined}
        className={`absolute inset-y-0 left-0 flex w-[80%] max-w-[320px] flex-col overflow-y-auto overscroll-contain border-r border-zinc-200 bg-white pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] shadow-2xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-white/10 dark:bg-[#09090B] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 pt-4">
          <Link
            href="/profile"
            onClick={onClose}
            aria-label={`Your profile, ${user.displayName}`}
            className="flex min-h-11 flex-col items-start gap-2 rounded-2xl focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none"
          >
            <Avatar
              name={user.displayName}
              image={user.avatarDataUrl}
              accent={user.accent}
              expandable={false}
              className="h-12 w-12 text-sm"
            />
            <span className="block w-full min-w-0">
              <span className="block truncate text-[17px] font-semibold tracking-tight">
                {user.displayName}
              </span>
              <span className="block truncate text-[15px] text-zinc-500">@{user.username}</span>
            </span>
          </Link>
          <div className="mt-1 flex items-center gap-1 text-[14px]">
            <CountLink href="/profile/following" count={followingCount(userId)} label="Following" onPick={onClose} />
            <span aria-hidden className="text-zinc-400">
              ·
            </span>
            <CountLink href="/profile/followers" count={followerCount(userId)} label="Followers" onPick={onClose} />
          </div>
          {summary && summary.pins.length > 0 ? (
            <ul aria-label="Pinned badges" className="mt-1 flex items-center gap-1">
              {summary.pins.map((badge) => (
                <li key={`${badge.category}:${badge.tier}`}>
                  <Link
                    href={badgesHref}
                    onClick={onClose}
                    aria-label={badgeLabel(badge.category, badge.tier)}
                    className="grid h-11 w-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none"
                  >
                    <Badge category={badge.category} tier={badge.tier} size={36} label="" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Menu" className="mt-3 px-2">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = menuItemActive(pathname, item.href, user.username);
              const Icon = ITEM_ICONS[item.href] ?? User;
              let trailing: ReactNode = null;
              let label: string = item.label;
              if (item.href === "/achievements") {
                if (!summary) {
                  trailing = <span aria-hidden className="skeleton-shimmer h-5 w-12 rounded-full" />;
                } else if (summary.label) {
                  label = `Achievements, ${summary.label} badges earned`;
                  trailing = (
                    <span className="rounded-full bg-[#7C3AED]/12 px-2 py-0.5 font-mono text-xs font-medium text-[#7C3AED] tabular-nums dark:bg-[#7C3AED]/20 dark:text-[#A78BFA]">
                      {summary.label}
                    </span>
                  );
                }
              }
              if (item.href === "/messages" && unreadMessageCount > 0) {
                label = `Messages, ${unreadMessageCount} unread`;
                trailing = (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#7C3AED] px-1.5 text-[11px] font-semibold leading-none text-white">
                    {countLabel(unreadMessageCount)}
                  </span>
                );
              }
              if (item.href === INVITE_MENU_HREF) {
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      data-invite-menu=""
                      onClick={() => {
                        // Share first, in the tap, so the phone's sheet is allowed to open.
                        void invite.share();
                        onClose();
                      }}
                      className={`${mainRow} w-full text-left ${rowTone(false)}`}
                    >
                      <Icon aria-hidden className={`h-6 w-6 shrink-0 ${iconTone(false)}`} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-label={label === item.label ? undefined : label}
                    aria-current={active ? "page" : undefined}
                    className={`${mainRow} ${rowTone(active)}`}
                  >
                    <Icon aria-hidden className={`h-6 w-6 shrink-0 ${iconTone(active)}`} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {trailing}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-4 my-3 border-t border-zinc-200 dark:border-white/10" />

        <div className="px-2">
          <h2 className="px-3 pb-1 text-[13px] font-medium text-zinc-500">
            Settings and support
          </h2>
          <ul className="space-y-0.5">
            {SIDE_MENU_SETTINGS.map((item) => {
              const active = menuItemActive(pathname, item.href, user.username);
              const Icon = ITEM_ICONS[item.href] ?? Info;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`${settingsRow} ${rowTone(active)}`}
                  >
                    <Icon aria-hidden className={`h-5 w-5 shrink-0 ${iconTone(active)}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {mountExtras ? (
              <AdminMenuLinks
                renderLink={(item) => {
                  const active = menuItemActive(pathname, item.href, user.username);
                  return (
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`${settingsRow} ${rowTone(active)}`}
                    >
                      <Wrench aria-hidden className={`h-5 w-5 shrink-0 ${iconTone(active)}`} />
                      {item.label}
                    </Link>
                  );
                }}
              />
            ) : null}
            {onAddToHome ? (
              <li>
                <button
                  type="button"
                  onClick={onAddToHome}
                  className={`${settingsRow} ${rowTone(false)} w-full text-left`}
                >
                  <SquarePlus aria-hidden className="h-5 w-5 shrink-0" />
                  {ADD_TO_HOME_LABEL}
                </button>
              </li>
            ) : null}
            <li>
              <button type="button" onClick={takeTour} className={`${settingsRow} ${rowTone(false)} w-full text-left`}>
                <Compass aria-hidden className="h-5 w-5 shrink-0" />
                {TAKE_TOUR_LABEL}
              </button>
            </li>
            <li>
              <button type="button" onClick={logOut} className={`${settingsRow} ${rowTone(false)} w-full text-left`}>
                <LogOut aria-hidden className="h-5 w-5 shrink-0" />
                Log out
              </button>
            </li>
          </ul>
        </div>

        <div className="mt-auto px-5 pt-5 text-xs leading-5 text-zinc-500">
          {status ? (
            <p className="text-rose-600 dark:text-rose-400">{status}</p>
          ) : mode === "local" ? (
            <p>Accounts are saved in this browser. Add Supabase keys in .env.local when you want hosted login.</p>
          ) : null}
          <p className={status || mode === "local" ? "mt-2" : undefined}>
            Slabhold follows your device light or dark mode.
          </p>
        </div>
      </div>
    </div>,
    document.body,
      )}
      {invite.sheet}
    </>
  );
}

function CountLink({
  href,
  count,
  label,
  onPick,
}: {
  href: string;
  count: number;
  label: string;
  onPick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onPick}
      className="inline-flex min-h-11 items-center gap-1 rounded-full px-1 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none first:-ml-1"
    >
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-zinc-500">{label}</span>
    </Link>
  );
}
