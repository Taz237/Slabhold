"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useInstallPlatform, useNativeApp } from "@/components/onboarding/use-install-platform";
import { appHomeLoginPath } from "@/lib/pwa/install-step";

/**
 * The installed app on signed-out Home: same as StandaloneLoginGate, for a
 * reader with no session cookie (so nobody is signed in). They get the short
 * "log in once" screen, with Home held blank so the landing page never flashes.
 */
export function StandaloneRedirect() {
  const router = useRouter();
  // The iPhone app goes to log in as well: it never shows the website's landing page.
  const loginPath = appHomeLoginPath(useInstallPlatform(), useNativeApp());

  useEffect(() => {
    if (loginPath) router.replace(loginPath);
  }, [loginPath, router]);

  if (!loginPath) return null;
  return <div className="fixed inset-0 z-50 min-h-dvh bg-[var(--background)]" />;
}
