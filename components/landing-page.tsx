"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { trackEvent } from "@/lib/analytics";
import { landingLoginHref, landingSignupHref, safeNext } from "@/lib/auth/safe-next";

const SHOTS = [
  { src: "/landing/1.png", label: "The timeline", width: 860, height: 1860 },
  { src: "/landing/2.png", label: "Your slabs", width: 860, height: 1734 },
  { src: "/landing/3.png", label: "Sold prices", width: 860, height: 1860 },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#09090b] text-zinc-100" style={{ backgroundColor: "#09090b" }}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.28),_transparent_55%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(2.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
        </div>

        <h1 className="mt-10 text-[2rem] font-bold leading-[1.15] tracking-tight">
          The social home for sports card collectors.
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-6 text-zinc-400">
          Track your slabs, see real sold prices, post your pickups, and follow collectors.
        </p>

        <Suspense fallback={<LandingActions next="/" />}>
          <LandingActionsFromSearch />
        </Suspense>

        <div className="mt-10 min-w-0 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-4">
            {SHOTS.map((shot) => (
              <LandingShot
                key={shot.src}
                src={shot.src}
                label={shot.label}
                width={shot.width}
                height={shot.height}
              />
            ))}
          </div>
        </div>

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

function LandingActionsFromSearch() {
  const next = safeNext(useSearchParams().get("next"));
  return <LandingActions next={next} />;
}

export function LandingActions({ next }: { next: string }) {
  return (
    <div className="mt-8 space-y-3">
      <Link
        href={landingSignupHref(next)}
        onClick={() => trackEvent("landing_cta_clicked", { button: "signup" })}
        className="block w-full rounded-full bg-[#7C3AED] py-3.5 text-center text-[15px] font-semibold text-white"
      >
        Sign up
      </Link>
      <Link
        href={landingLoginHref(next)}
        onClick={() => trackEvent("landing_cta_clicked", { button: "login" })}
        className="block w-full rounded-full border border-white/15 py-3.5 text-center text-[15px] font-semibold text-white"
      >
        Log in
      </Link>
    </div>
  );
}

function LandingShot({
  src,
  label,
  width,
  height,
}: {
  src: string;
  label: string;
  width: number;
  height: number;
}) {
  const [phase, setPhase] = useState<"check" | "ready" | "missing">("check");

  useEffect(() => {
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled) setPhase("ready");
    };
    probe.onerror = () => {
      if (!cancelled) setPhase("missing");
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="w-[min(220px,72vw)] shrink-0 sm:w-[220px]">
      {phase === "ready" ? (
        <div
          className="relative w-full overflow-hidden rounded-[1.6rem] border border-white/10 shadow-[0_20px_60px_rgba(124,58,237,0.25)]"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <Image
            src={src}
            alt={`${label} screenshot`}
            fill
            sizes="(max-width: 639px) 72vw, 220px"
            className="object-contain"
            onError={() => setPhase("missing")}
          />
        </div>
      ) : (
        <ShotPlaceholder label={label} width={width} height={height} />
      )}
    </div>
  );
}

function ShotPlaceholder({
  label,
  width,
  height,
}: {
  label: string;
  width: number;
  height: number;
}) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-[#2e1065] to-[#09090b] px-4 text-center"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <Logo className="h-12 w-12" />
      <p className="mt-4 text-sm font-semibold text-white">{label}</p>
    </div>
  );
}
