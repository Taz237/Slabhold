"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useInstallPlatform } from "@/components/onboarding/use-install-platform";
import { standaloneLoginPath } from "@/lib/pwa/install-step";

/**
 * The installed app on signed-out Home: same as StandaloneLoginGate, for a
 * reader with no session cookie (so nobody is signed in). They get the short
 * "log in once" screen, with Home held blank so the landing page never flashes.
 */
export function StandaloneRedirect() {
  const router = useRouter();
  const installed = useInstallPlatform() === "installed";

  useEffect(() => {
    if (installed) router.replace(standaloneLoginPath());
  }, [installed, router]);

  if (!installed) return null;
  return <div className="fixed inset-0 z-50 min-h-dvh bg-[var(--background)]" />;
}
