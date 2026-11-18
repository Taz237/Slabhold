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
  ChevronDown,
  Compass,
  Info,
  LifeBuoy,
  LogOut,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  SquarePlus,
  Tag,
  LayoutGrid,
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
import { sideMenuItems } from "@/lib/ui/side-menu-items";
import { edgeSwipeClaims } from "@/lib/ui/nav-motion";
import {
  ADD_TO_HOME_LABEL,
  INVITE_MENU_HREF,
  SIDE_MENU_DELETE,
  SIDE_MENU_LEGAL,
  SIDE_MENU_LEGAL_LABEL,
  SIDE_MENU_SETTINGS,
  SIDE_MENU_SUPPORT,
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
  "/catalog": LayoutGrid,
  [INVITE_MENU_HREF]: UserPlus,
  "/settings/notifications": Bell,
  "/settings/privacy": ShieldCheck,
  "/settings/collecting": SlidersHorizontal,
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none";

/** Main items: big rows that give a little under the thumb. */
const mainRow =
  "tap-fade flex min-h-[3.25rem] items-center gap-4 rounded-2xl px-3 text-17 font-medium transition-[scale] duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none";
/** Settings: smaller and quieter, so the main items lead. */
const settingsRow =
  "tap-fade flex min-h-11 items-center gap-3 rounded-xl px-3 text-15 transition-[scale] duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none";
/** About & legal rows: text only, lined up under the labels above. */
const legalRow = `tap-fade flex min-h-11 items-center rounded-xl pr-3 pl-11 text-14 ${FOCUS_RING}`;

const HAIRLINE = "mx-5 my-2 h-px bg-zinc-900/[0.07] dark:bg-white/[0.08]";

/** The current row sits on the same glass pill as the current tab. */
function rowTone(active: boolean) {
  return active
    ? "glass-highlight text-zinc-950 dark:text-white"
    : "text-zinc-900 hover:bg-zinc-900/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.05]";
}

function quietTone(active: boolean) {
  return active
    ? "glass-highlight text-zinc-950 dark:text-white"
    : "text-zinc-600 hover:bg-zinc-900/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.05]";
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
  /** Rows step in on a tap. A finger-dragged menu arrives with them already in place. */
  const [stagger, setStagger] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const platform = useInstallPlatform();

  const openMenu = useCallback(() => {
    setStagger(true);
    setOpen(true);
    setEverOpened(true);
  }, []);
  const openFromSwipe = useCallback(() => {
    setStagger(false);
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
  useMenuEdgeSwipe({ enabled: Boolean(user) && pathname === "/", panelId, open, onOpen: openFromSwipe });

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
          className="h-8 w-8 text-11"
        />
      </button>
      <Suspense fallback={null}>
        <MenuQueryOpener onOpen={openMenu} />
      </Suspense>
      <SideMenu
        id={panelId}
        user={user}
        open={open}
        stagger={stagger}
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
 * X-style side menu: a glass panel that slides in from the left over a dimmed page. Closes on
 * the backdrop, a swipe left, Escape, or picking an item. Focus stays inside
 * and the page does not scroll while it is open.
 */
export function SideMenu({
  id,
  user,
  open,
  stagger = true,
  mountExtras,
  onClose,
  returnFocus,
  onAddToHome,
}: {
  id: string;
  user: Profile;
  open: boolean;
  /** Rows step in a few ms apart as the menu opens. Off when a swipe dragged it out. */
  stagger?: boolean;
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
  /** About & legal: null until tapped, so it starts open on one of its own pages. */
  const [legalPicked, setLegalPicked] = useState<boolean | null>(null);
  const legalRef = useRef<HTMLUListElement>(null);
  const legalId = useId();
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
    panel?.focus({ preventScroll: true });
    // A browser refuses focus until the panel has turned visible, a frame or two in: ask again until it takes.
    let refocus = 0;
    let tries = 0;
    const takeFocus = () => {
      if (!panel || panel.contains(document.activeElement) || tries++ >= 6) return;
      panel.focus({ preventScroll: true });
      refocus = window.requestAnimationFrame(takeFocus);
    };
    refocus = window.requestAnimationFrame(takeFocus);

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
      window.cancelAnimationFrame(refocus);
      document.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      focusTarget?.focus();
    };
  }, [open, returnFocus]);

  if (!onClient) return null;

  const summary = badges?.userId === userId ? badges : null;
  const badgesHref = `${userHref(user.username)}/badges`;
  const supportActive = menuItemActive(pathname, SIDE_MENU_SUPPORT.href, user.username);
  const legalOpen = legalPicked ?? SIDE_MENU_LEGAL.some((item) => menuItemActive(pathname, item.href, user.username));

  function toggleLegal() {
    const opening = !legalOpen;
    setLegalPicked(opening);
    if (!opening) return;
    // The group opens at the foot of the panel: bring its rows into view.
    window.requestAnimationFrame(() => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      legalRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    });
  }

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

  const items = sideMenuItems().filter((item) => item.href !== "/achievements" || hosted);

  return (
    <>
      {createPortal(
    <div
      className={`fixed inset-0 z-50 transition-[visibility] duration-300 motion-reduce:duration-0 ${
        open ? "visible" : "invisible"
      }`}
      inert={!open}
      data-menu-open={open && stagger ? "" : undefined}
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
        className={`glass liquid-glass-panel absolute inset-y-0 left-0 flex w-[80%] max-w-[320px] flex-col big:w-full big:max-w-none overflow-y-auto overscroll-contain rounded-r-[1.75rem] big:rounded-none pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          data-menu-step="0"
          className="mx-3 mt-3 rounded-3xl bg-white/70 p-3 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)] dark:bg-white/[0.04] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
        >
          <Link
            href="/profile"
            onClick={onClose}
            aria-label={`Your profile, ${user.displayName}`}
            className={`tap-fade flex min-h-14 items-center gap-3 rounded-2xl ${FOCUS_RING}`}
          >
            <span className="relative shrink-0">
              <span
                aria-hidden
                className="absolute -inset-3 rounded-full bg-[radial-gradient(closest-side,rgba(124,58,237,0.28),transparent)] dark:bg-[radial-gradient(closest-side,rgba(124,58,237,0.45),transparent)]"
              />
              <Avatar
                name={user.displayName}
                image={user.avatarDataUrl}
                accent={user.accent}
                expandable={false}
                className="relative h-12 w-12 text-sm"
              />
            </span>
            <span className="block min-w-0 flex-1">
              <span className="block truncate text-17 font-semibold">{user.displayName}</span>
              <span className="block truncate text-14 text-zinc-500 dark:text-zinc-400">@{user.username}</span>
            </span>
          </Link>
          <div className="mt-1 flex items-center gap-3 text-14">
            <CountLink href="/profile/following" count={followingCount(userId)} label="Following" onPick={onClose} />
            <CountLink href="/profile/followers" count={followerCount(userId)} label="Followers" onPick={onClose} />
          </div>
          {summary && summary.pins.length > 0 ? (
            <ul aria-label="Pinned badges" className="-mx-1 flex items-center">
              {summary.pins.map((badge) => (
                <li key={`${badge.category}:${badge.tier}`}>
                  <Link
                    href={badgesHref}
                    onClick={onClose}
                    aria-label={badgeLabel(badge.category, badge.tier)}
                    className={`grid h-11 w-11 place-items-center rounded-full ${FOCUS_RING}`}
                  >
                    <Badge category={badge.category} tier={badge.tier} size={36} label="" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Menu" className="mt-3 px-3">
          <ul className="space-y-1">
            {items.map((item, index) => {
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
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#7C3AED] px-1.5 text-11 font-semibold leading-none text-white">
                    {countLabel(unreadMessageCount)}
                  </span>
                );
              }
              if (item.href === INVITE_MENU_HREF) {
                return (
                  <li key={item.href} data-menu-step={index + 1}>
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
                      <Icon aria-hidden strokeWidth={1.75} className={`h-[22px] w-[22px] shrink-0 ${iconTone(false)}`} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.href} data-menu-step={index + 1}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-label={label === item.label ? undefined : label}
                    aria-current={active ? "page" : undefined}
                    className={`${mainRow} ${rowTone(active)}`}
                  >
                    <Icon aria-hidden strokeWidth={1.75} className={`h-[22px] w-[22px] shrink-0 ${iconTone(active)}`} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {trailing}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div aria-hidden className={HAIRLINE} />

        <ul aria-label="Settings and support" data-menu-quiet="" data-menu-step="8" className="px-3">
          {SIDE_MENU_SETTINGS.map((item) => {
            const active = menuItemActive(pathname, item.href, user.username);
            const Icon = ITEM_ICONS[item.href] ?? Info;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`${settingsRow} ${quietTone(active)}`}
                >
                  <Icon aria-hidden strokeWidth={1.75} className={`h-5 w-5 shrink-0 ${iconTone(active)}`} />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={SIDE_MENU_SUPPORT.href}
              onClick={onClose}
              aria-current={supportActive ? "page" : undefined}
              className={`${settingsRow} ${quietTone(supportActive)}`}
            >
              <LifeBuoy aria-hidden strokeWidth={1.75} className={`h-5 w-5 shrink-0 ${iconTone(supportActive)}`} />
              {SIDE_MENU_SUPPORT.label}
            </Link>
          </li>
          <li>
            <button type="button" onClick={takeTour} className={`${settingsRow} ${quietTone(false)} w-full text-left`}>
              <Compass aria-hidden strokeWidth={1.75} className="h-5 w-5 shrink-0" />
              {TAKE_TOUR_LABEL}
            </button>
          </li>
          {onAddToHome ? (
            <li>
              <button
                type="button"
                onClick={onAddToHome}
                className={`${settingsRow} ${quietTone(false)} w-full text-left`}
              >
                <SquarePlus aria-hidden strokeWidth={1.75} className="h-5 w-5 shrink-0" />
                {ADD_TO_HOME_LABEL}
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              aria-expanded={legalOpen}
              aria-controls={legalId}
              onClick={toggleLegal}
              className={`${settingsRow} ${quietTone(false)} w-full text-left`}
            >
              <Info aria-hidden strokeWidth={1.75} className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">{SIDE_MENU_LEGAL_LABEL}</span>
              <ChevronDown
                aria-hidden
                strokeWidth={1.75}
                className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                  legalOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {legalOpen ? (
              <ul ref={legalRef} id={legalId} data-menu-legal="" className="scroll-mb-4">
                {SIDE_MENU_LEGAL.map((item) => {
                  const active = menuItemActive(pathname, item.href, user.username);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`${legalRow} ${quietTone(active)}`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link
                    href={SIDE_MENU_DELETE.href}
                    onClick={onClose}
                    className={`${legalRow} text-rose-700/90 hover:bg-rose-600/[0.06] dark:text-rose-300/80 dark:hover:bg-rose-400/[0.08]`}
                  >
                    {SIDE_MENU_DELETE.label}
                  </Link>
                </li>
              </ul>
            ) : null}
          </li>
        </ul>

        <div data-menu-step="9" className="mt-auto px-3 pt-2">
          <div aria-hidden className="mx-2 mb-2 h-px bg-zinc-900/[0.07] dark:bg-white/[0.08]" />
          <button type="button" onClick={logOut} className={`${settingsRow} ${quietTone(false)} w-full text-left`}>
            <LogOut aria-hidden strokeWidth={1.75} className="h-5 w-5 shrink-0" />
            Log out
          </button>
          {mountExtras ? (
            <ul
              aria-label="Admin"
              className="[&:not(:empty)]:mt-2 [&:not(:empty)]:border-t [&:not(:empty)]:border-zinc-900/[0.07] [&:not(:empty)]:pt-2 dark:[&:not(:empty)]:border-white/[0.08]"
            >
              <AdminMenuLinks
                renderLink={(item) => {
                  const active = menuItemActive(pathname, item.href, user.username);
                  return (
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`${settingsRow} ${quietTone(active)}`}
                    >
                      <Wrench aria-hidden strokeWidth={1.75} className={`h-5 w-5 shrink-0 ${iconTone(active)}`} />
                      {item.label}
                    </Link>
                  );
                }}
              />
            </ul>
          ) : null}
        </div>

        {status || mode === "local" ? (
          <div className="px-6 pt-3 text-xs leading-5 text-zinc-500">
            {status ? (
              <p className="text-rose-600 dark:text-rose-400">{status}</p>
            ) : (
              <p>Accounts are saved in this browser. Add Supabase keys in .env.local when you want hosted login.</p>
            )}
          </div>
        ) : null}
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
      className={`tap-fade inline-flex min-h-11 items-center gap-1.5 rounded-full ${FOCUS_RING}`}
    >
      <span className="font-mono font-medium tabular-nums">{count}</span>
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
    </Link>
  );
}
