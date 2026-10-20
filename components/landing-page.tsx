"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

const SHOTS = [
  { src: "/landing/1.png", label: "The timeline" },
  { src: "/landing/2.png", label: "Your slabs" },
  { src: "/landing/3.png", label: "Sold prices" },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#09090b] text-zinc-100">
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
          Track your slabs, see real sold prices, post your mail days, and follow collectors.
        </p>

        <div className="mt-8 space-y-3">
          <Link
            href="/signup"
            className="block w-full rounded-full bg-[#7C3AED] py-3.5 text-center text-[15px] font-semibold text-white"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="block w-full rounded-full border border-white/15 py-3.5 text-center text-[15px] font-semibold text-white"
          >
            Log in
          </Link>
        </div>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-2">
          {SHOTS.map((shot) => (
            <LandingShot key={shot.src} src={shot.src} label={shot.label} />
          ))}
        </div>

        <footer className="mt-auto flex gap-4 pt-10 text-sm text-zinc-400">
          <Link href="/privacy" className="font-semibold underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="font-semibold underline underline-offset-2">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}

function LandingShot({ src, label }: { src: string; label: string }) {
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
    <div className="w-[220px] shrink-0">
      {phase === "ready" ? (
        <Image
          src={src}
          alt={`${label} screenshot`}
          width={1170}
          height={2532}
          sizes="220px"
          className="h-auto w-full rounded-[1.6rem] border border-white/10 shadow-[0_20px_60px_rgba(124,58,237,0.25)]"
          onError={() => setPhase("missing")}
        />
      ) : (
        <ShotPlaceholder label={label} />
      )}
    </div>
  );
}

function ShotPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex aspect-[1170/2532] w-full flex-col items-center justify-center rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-[#2e1065] to-[#09090b] px-4 text-center">
      <Logo className="h-12 w-12" />
      <p className="mt-4 text-sm font-semibold text-white">{label}</p>
    </div>
  );
}
