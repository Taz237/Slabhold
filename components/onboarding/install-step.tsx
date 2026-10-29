"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  House,
  RotateCw,
  SquarePlus,
  Star,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useReducedMotion } from "@/components/timeline-ui";
import { trapTabTarget } from "@/lib/social/collect-interests";
import {
  androidChromeIntent,
  emailHintCookie,
  inAppBrowserName,
  installPlatform,
  openInBrowserName,
  settleInstallChoice,
  type InstallChoice,
  type InstallPlatform,
} from "@/lib/pwa/install-step";
import { installPromptReady, promptInstall, subscribeInstallPrompt } from "@/lib/pwa/install-prompt";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Each picture holds this long before the next step plays. */
const SCENE_MS = 2600;

const RISE = "motion-safe:animate-[install-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]";

const primaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(124,58,237,0.8)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] focus-visible:outline-none";
const secondaryButton =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 text-[16px] font-semibold text-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none";
const quietButton =
  "flex min-h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-zinc-400 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none";

export type GuidePlatform = Exclude<InstallPlatform, "installed" | "desktop">;

const noopSubscribe = () => () => {};

function readPlatform(): InstallPlatform {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return installPlatform({
    userAgent: nav.userAgent ?? "",
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
  });
}

/** This device, from the browser. Null on the server and during hydration. */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(noopSubscribe, readPlatform, () => null);
}

function useInstallPromptReady(): boolean {
  return useSyncExternalStore(subscribeInstallPrompt, installPromptReady, () => false);
}

type GuideStep = { title: ReactNode; text: string; detail: string };

/** Safari's Share icon: a square with an arrow out of the top. */
function ShareGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-share-icon=""
      className={className}
    >
      <path d="M8.5 9.5H7.25A2.25 2.25 0 0 0 5 11.75v7A2.25 2.25 0 0 0 7.25 21h9.5A2.25 2.25 0 0 0 19 18.75v-7a2.25 2.25 0 0 0-2.25-2.25H15.5" />
      <path d="M12 2.75v11.5" />
      <path d="M8.5 6.25 12 2.75l3.5 3.5" />
    </svg>
  );
}

function stepsFor(platform: GuidePlatform, browser: string): GuideStep[] {
  if (platform === "in-app") {
    return [
      {
        title: (
          <>
            Tap <Ellipsis aria-hidden className="inline h-4 w-4 align-[-3px]" /> or Share
          </>
        ),
        text: "Tap ⋯ or Share",
        detail: "In the corner of this browser, top or bottom.",
      },
      {
        title: `Open in ${browser}`,
        text: `Open in ${browser}`,
        detail: "Or copy the link and paste it there.",
      },
      {
        title: "Add it from there",
        text: "Add it from there",
        detail: "We'll show you the steps again.",
      },
    ];
  }
  if (platform === "android") {
    return [
      { title: "Tap ⋮", text: "Tap ⋮", detail: "The three dots, top right of Chrome." },
      { title: "Tap Install app", text: "Tap Install app", detail: "Some phones say Add to Home screen." },
      { title: "Tap Install", text: "Tap Install", detail: "Slabhold lands on your home screen." },
    ];
  }
  return [
    {
      title: (
        <>
          Tap Share <ShareGlyph className="inline h-4 w-4 align-[-2px] text-[#A78BFA]" />
        </>
      ),
      text: "Tap Share",
      detail:
        platform === "ios-safari"
          ? "At the bottom of Safari. On newer iOS it may be under ⋯ first."
          : "Next to the address bar, or under ⋯ in the menu.",
    },
    { title: "Tap Add to Home Screen", text: "Tap Add to Home Screen", detail: "Scroll down the list if you don't see it." },
    { title: "Tap Add", text: "Tap Add", detail: "Top right. Slabhold lands on your home screen." },
  ];
}

/** A purple ring that pings around the thing to tap. */
function Hot({ on, children, round = true }: { on: boolean; children: ReactNode; round?: boolean }) {
  const shape = round ? "rounded-full" : "rounded-lg";
  return (
    <span className={`relative inline-grid place-items-center ${shape}`}>
      {on ? (
        <>
          <span className={`install-ping absolute -inset-1.5 ${shape} border-2 border-[#A78BFA]`} />
          <span className={`absolute -inset-1 ${shape} bg-[#7C3AED]/35`} />
        </>
      ) : null}
      <span className={`relative ${on ? "text-white" : ""}`}>{children}</span>
    </span>
  );
}

/** Placeholder page lines, so the phone looks like Slabhold without real data. */
function PageSketch({ dim = false }: { dim?: boolean }) {
  return (
    <div className={`space-y-2 px-3 pt-3 transition-opacity duration-300 motion-reduce:transition-none ${dim ? "opacity-30" : ""}`}>
      <div className="flex items-center gap-1.5">
        <Logo className="h-4 w-4" />
        <span className="h-1.5 w-12 rounded-full bg-white/20" />
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
        <div className="flex gap-1.5">
          <span className="h-4 w-4 shrink-0 rounded-full bg-[#7C3AED]/60" />
          <div className="flex-1 space-y-1">
            <span className="block h-1.5 w-3/4 rounded-full bg-white/20" />
            <span className="block h-1.5 w-1/2 rounded-full bg-white/10" />
          </div>
        </div>
        <span className="mt-2 block h-10 rounded-md bg-gradient-to-br from-[#5B21B6]/50 to-[#7C3AED]/20" />
      </div>
      <span className="block h-1.5 w-2/3 rounded-full bg-white/10" />
      <span className="block h-1.5 w-1/2 rounded-full bg-white/10" />
    </div>
  );
}

function Address() {
  return (
    <span className="flex h-5 min-w-0 flex-1 items-center justify-center rounded-full bg-white/10 px-2 font-mono text-[7px] tracking-wide text-zinc-300">
      slabhold.app
    </span>
  );
}

function SheetRow({ icon, label, on = false }: { icon: ReactNode; label: string; on?: boolean }) {
  return (
    <span
      className={`flex h-6 items-center justify-between rounded-md px-2 text-[8px] font-medium ${
        on ? "bg-[#7C3AED] text-white shadow-[0_0_0_2px_rgba(167,139,250,0.55)]" : "text-zinc-300"
      }`}
    >
      {label}
      <span className="grid h-3.5 w-3.5 place-items-center">{icon}</span>
    </span>
  );
}

function SafariScene({ step, platform }: { step: number; platform: "ios-safari" | "ios-browser" }) {
  if (step === 0) {
    if (platform === "ios-browser") {
      return (
        <>
          <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
            <Address />
            <Hot on>
              <ShareGlyph className="h-3.5 w-3.5" />
            </Hot>
          </div>
          <PageSketch />
        </>
      );
    }
    return (
      <>
        <PageSketch />
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#18181B]/95 px-2 pt-1.5 pb-2">
          <Address />
          <div className="mt-1.5 flex items-center justify-between px-1 text-zinc-400">
            <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
            <ChevronRight aria-hidden className="h-3.5 w-3.5 opacity-40" />
            <Hot on>
              <ShareGlyph className="h-3.5 w-3.5" />
            </Hot>
            <Bookmark aria-hidden className="h-3 w-3" />
            <span aria-hidden className="h-3 w-3 rounded-[3px] border border-current" />
          </div>
        </div>
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        <PageSketch dim />
        <div className="install-sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-[#232326] px-2 pt-2 pb-2.5">
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <Logo className="h-5 w-5" />
            <span className="min-w-0">
              <span className="block text-[8px] font-bold text-white">Slabhold</span>
              <span className="block font-mono text-[6px] text-zinc-500">slabhold.app</span>
            </span>
          </div>
          <div className="space-y-0.5 rounded-lg bg-white/[0.05] p-0.5">
            <SheetRow icon={<Copy aria-hidden className="h-3 w-3" />} label="Copy" />
            <SheetRow icon={<Star aria-hidden className="h-3 w-3" />} label="Add to Favorites" />
            <SheetRow icon={<SquarePlus aria-hidden className="h-3 w-3" />} label="Add to Home Screen" on />
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="install-sheet absolute inset-x-0 top-0 bottom-0 bg-[#1C1C1F] px-3.5 pt-5">
      <div className="flex items-center justify-between gap-1 text-[7px] whitespace-nowrap">
        <span className="text-zinc-400">Cancel</span>
        <span className="font-bold text-white">Add to Home Screen</span>
        <Hot on>
          <span className="px-1 font-bold text-[#A78BFA]">Add</span>
        </Hot>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.06] p-2">
        <Logo className="h-9 w-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block border-b border-white/15 pb-1 text-[9px] font-semibold text-white">Slabhold</span>
          <span className="mt-1 block truncate font-mono text-[6px] text-zinc-500">https://slabhold.app</span>
        </span>
      </div>
      <p className="mt-2 px-1 text-[7px] leading-[10px] text-zinc-500">
        An icon will be added to your Home Screen.
      </p>
    </div>
  );
}

function AndroidScene({ step }: { step: number }) {
  const bar = (on: boolean) => (
    <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 text-zinc-400">
      <House aria-hidden className="h-3 w-3" />
      <Address />
      <span aria-hidden className="grid h-3 w-3 place-items-center rounded-[3px] border border-current text-[6px]">
        1
      </span>
      <Hot on={on}>
        <EllipsisVertical aria-hidden className="h-3.5 w-3.5" />
      </Hot>
    </div>
  );
  if (step === 0) {
    return (
      <>
        {bar(true)}
        <PageSketch />
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        {bar(false)}
        <PageSketch dim />
        <div className="install-sheet absolute top-7 right-1.5 w-[70%] space-y-0.5 rounded-lg border border-white/10 bg-[#232326] p-1 shadow-xl">
          <SheetRow icon={<SquarePlus aria-hidden className="h-3 w-3" />} label="New tab" />
          <SheetRow icon={<Star aria-hidden className="h-3 w-3" />} label="Bookmarks" />
          <SheetRow icon={<Download aria-hidden className="h-3 w-3" />} label="Install app" on />
          <SheetRow icon={<ExternalLink aria-hidden className="h-3 w-3" />} label="Share…" />
        </div>
      </>
    );
  }
  return (
    <>
      {bar(false)}
      <PageSketch dim />
      <div className="install-sheet absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#232326] p-2.5 shadow-xl">
        <p className="text-[9px] font-bold text-white">Install app</p>
        <div className="mt-2 flex items-center gap-2">
          <Logo className="h-7 w-7 shrink-0" />
          <span>
            <span className="block text-[8px] font-semibold text-white">Slabhold</span>
            <span className="block font-mono text-[6px] text-zinc-500">slabhold.app</span>
          </span>
        </div>
        <div className="mt-2.5 flex justify-end gap-3 pr-1 text-[8px] font-semibold">
          <span className="text-zinc-400">Cancel</span>
          <Hot on round={false}>
            <span className="px-1 text-[#A78BFA]">Install</span>
          </Hot>
        </div>
      </div>
    </>
  );
}

function InAppScene({ step, browser }: { step: number; browser: string }) {
  const bar = (on: boolean) => (
    <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 text-zinc-400">
      <X aria-hidden className="h-3 w-3" />
      <Address />
      <Hot on={on}>
        <Ellipsis aria-hidden className="h-3.5 w-3.5" />
      </Hot>
    </div>
  );
  if (step === 0) {
    return (
      <>
        {bar(true)}
        <PageSketch />
      </>
    );
  }
  return (
    <>
      {bar(false)}
      <PageSketch dim />
      <div className="install-sheet absolute inset-x-0 bottom-0 space-y-0.5 rounded-t-2xl border-t border-white/10 bg-[#232326] p-2 pb-3">
        <span aria-hidden className="mx-auto mb-1.5 block h-1 w-6 rounded-full bg-white/20" />
        <SheetRow icon={<Copy aria-hidden className="h-3 w-3" />} label="Copy link" />
        <SheetRow icon={<ExternalLink aria-hidden className="h-3 w-3" />} label={`Open in ${browser}`} on />
        <SheetRow icon={<RotateCw aria-hidden className="h-3 w-3" />} label="Refresh" />
      </div>
    </>
  );
}

/** The last picture: a home screen of blank tiles, and Slabhold landing on it. */
function HomeScene() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.35),_transparent_70%)] px-3 pt-5">
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3">
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} className="aspect-square rounded-[9px] bg-white/[0.08]" />
        ))}
        <span className="install-land flex flex-col items-center gap-0.5">
          <Logo className="aspect-square h-auto w-full drop-shadow-[0_6px_14px_rgba(124,58,237,0.7)]" />
        </span>
      </div>
      <p className="install-land mt-1 text-right text-[7px] font-semibold text-white">Slabhold</p>
      <div className="absolute inset-x-2 bottom-2 grid grid-cols-4 gap-2.5 rounded-2xl bg-white/[0.06] p-2">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="aspect-square rounded-[9px] bg-white/[0.1]" />
        ))}
      </div>
    </div>
  );
}

function Scene({ platform, scene, steps, browser }: { platform: GuidePlatform; scene: number; steps: number; browser: string }) {
  if (scene >= steps) return <HomeScene />;
  if (platform === "android") return <AndroidScene step={scene} />;
  if (platform === "in-app") {
    if (scene < 2) return <InAppScene step={scene} browser={browser} />;
    return browser === "Chrome" ? <AndroidScene step={0} /> : <SafariScene step={0} platform="ios-safari" />;
  }
  return <SafariScene step={scene} platform={platform} />;
}

/** The phone. Every picture is stacked and cross-fades; only the current one is on. */
function PhoneDemo({ platform, scene, steps, browser }: { platform: GuidePlatform; scene: number; steps: number; browser: string }) {
  return (
    <div aria-hidden className="relative mx-auto w-[160px]">
      <div className="absolute -inset-10 rounded-full bg-[#7C3AED] opacity-30 blur-[60px]" />
      <div className="relative h-[200px] rounded-[30px] border border-white/15 bg-[#18181B] p-[5px] shadow-[0_30px_70px_-25px_rgba(124,58,237,0.75)]">
        <div className="relative h-full overflow-hidden rounded-[25px] bg-[#09090B]">
          <span className="absolute top-1.5 left-1/2 z-10 h-2.5 w-12 -translate-x-1/2 rounded-full bg-black" />
          {Array.from({ length: steps + 1 }, (_, index) => (
            // The current picture remounts so its sheet or icon animation plays again.
            <div
              key={index === scene ? `on-${index}` : `off-${index}`}
              className={`absolute inset-0 pt-4 transition-opacity duration-300 motion-reduce:transition-none ${
                index === scene ? "opacity-100" : "opacity-0"
              }`}
            >
              <Scene platform={platform} scene={index} steps={steps} browser={browser} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand?.("copy") ?? false;
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Put Slabhold on your home screen". In onboarding it comes right before
 * setup; the side menu opens the same screen later. Shows the steps for this
 * device, the real install prompt on Android when Chrome offers one, and
 * "open in Safari or Chrome" for in-app browsers. Skipping always works.
 */
export function InstallGuide({
  platform,
  variant,
  email,
  onDone,
}: {
  platform: GuidePlatform;
  variant: "onboarding" | "menu";
  email?: string | null;
  onDone: (choice: InstallChoice) => void;
}) {
  const reducedMotion = useReducedMotion();
  const promptReady = useInstallPromptReady();
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  const titleId = useId();
  const leadId = useId();
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = openInBrowserName(userAgent);
  const appName = inAppBrowserName(userAgent) ?? "this app";
  const steps = stepsFor(platform, browser);
  const nativePrompt = platform === "android" && promptReady;

  // Every answer goes through here so "Maybe later" drops the email hint.
  function done(choice: InstallChoice) {
    settleInstallChoice(choice);
    onDone(choice);
  }

  useEffect(() => {
    doneRef.current = done;
  });

  // The installed app on iPhone may open logged out. This lets its login
  // screen fill in the email (iOS can copy Safari's cookies across).
  useEffect(() => {
    if (variant !== "onboarding" || !email) return;
    if (platform !== "ios-safari" && platform !== "ios-browser") return;
    document.cookie = emailHintCookie(email, window.location.protocol === "https:");
  }, [variant, email, platform]);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const timer = window.setInterval(() => setScene((current) => (current + 1) % (steps.length + 1)), SCENE_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, paused, steps.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const docEl = document.documentElement;
    const overflow = docEl.style.overflow;
    docEl.style.overflow = "hidden";
    root.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        doneRef.current("later");
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const list = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const next = trapTabTarget(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (next == null) return;
      event.preventDefault();
      list[next]?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      docEl.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  function show(index: number) {
    setPaused(true);
    setScene(index);
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") done("added");
  }

  async function copyLink() {
    const ok = await copyText(`${window.location.origin}/`);
    if (ok) setCopied(true);
  }

  const inApp = platform === "in-app";
  const title = inApp ? `Open Slabhold in ${browser}` : "Put Slabhold on your home screen";
  const lead = inApp
    ? `${appName === "this app" ? "This app's" : `${appName}'s`} browser can't add apps to your home screen. Open Slabhold in ${browser}, then add it from there.`
    : "It opens full screen like a real app, sits one tap away, and the back swipe feels smoother.";
  const activeStep = Math.min(scene, steps.length);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={leadId}
      tabIndex={-1}
      data-install-step=""
      className="fixed inset-0 z-50 flex flex-col bg-[#09090B] text-[#F4F4F5] outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.24),_transparent_55%)]" />
      <header className="relative mx-auto flex w-full max-w-lg items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Logo className="h-8 w-8" />
        <span className="font-mono text-[11px] font-medium tracking-wider text-[#A78BFA] uppercase">
          {variant === "onboarding" ? "Before you dive in" : "Add to Home Screen"}
        </span>
        <span aria-hidden className="h-8 w-8" />
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full max-w-lg px-5 pt-4 pb-3 ${RISE}`}>
          <h2 id={titleId} className="text-[28px] leading-[1.1] font-extrabold tracking-tight">
            {title}
          </h2>
          <p id={leadId} className="mt-2 text-[15px] leading-6 text-zinc-400">
            {lead}
          </p>

          <div className="mt-5">
            <PhoneDemo platform={platform} scene={scene} steps={steps.length} browser={browser} />
          </div>

          {nativePrompt ? (
            <p className="mt-5 font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              Or use Chrome&apos;s menu
            </p>
          ) : null}
          <ol className={`${nativePrompt ? "mt-2" : "mt-5"} space-y-0.5`} aria-label="Steps">
            {steps.map((step, index) => {
              const current = activeStep === index;
              const past = activeStep > index;
              return (
                <li key={step.text}>
                  <button
                    type="button"
                    onClick={() => show(index)}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${step.text}. ${step.detail}`}
                    className={`flex min-h-12 w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none ${
                      current ? "bg-[#7C3AED]/15" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                        current
                          ? "bg-[#7C3AED] text-white shadow-[0_0_0_4px_rgba(124,58,237,0.25)]"
                          : past
                            ? "bg-[#5B21B6]/60 text-[#F4F4F5]"
                            : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {past ? <Check aria-hidden className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[16px] font-bold tracking-tight">{step.title}</span>
                      <span className="block text-[14px] leading-5 text-zinc-400">{step.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <footer className={`relative mx-auto w-full max-w-lg space-y-1 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${RISE}`}>
        {inApp ? (
          <>
            <button type="button" onClick={() => void copyLink()} className={primaryButton}>
              {copied ? <Check aria-hidden className="h-5 w-5" /> : <Copy aria-hidden className="h-5 w-5" />}
              {copied ? "Link copied" : "Copy link"}
            </button>
            {browser === "Chrome" ? (
              <a href={androidChromeIntent(`${window.location.origin}/`)} className={secondaryButton}>
                <ExternalLink aria-hidden className="h-4 w-4" />
                Open in Chrome
              </a>
            ) : null}
          </>
        ) : nativePrompt ? (
          <button type="button" onClick={() => void install()} className={primaryButton}>
            <Download aria-hidden className="h-5 w-5" />
            Install Slabhold
          </button>
        ) : (
          <button type="button" onClick={() => done("added")} className={primaryButton}>
            <Check aria-hidden className="h-5 w-5" />
            I added it
          </button>
        )}
        <button type="button" onClick={() => done("later")} className={quietButton}>
          Maybe later
        </button>
        {platform === "ios-safari" ? (
          <div data-share-arrow="" aria-hidden className="flex flex-col items-center text-[#A78BFA]">
            <span className="font-mono text-[10px] font-medium tracking-wider uppercase">
              Share is in Safari&apos;s bar below
            </span>
            <ChevronDown className="install-arrow h-6 w-6" strokeWidth={2.5} />
          </div>
        ) : null}
      </footer>
    </div>,
    document.body,
  );
}
