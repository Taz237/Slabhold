"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useInstallPlatform, useNativeApp } from "@/components/onboarding/use-install-platform";
import { useSocial } from "@/components/social-provider";
import { appHomeLoginPath } from "@/lib/pwa/install-step";

/**
 * Signed-out Home. In the installed app that's usually someone whose Safari
 * login didn't carry over, so they get a short "log in once" screen instead
 * of the landing page. The iPhone app goes to log in too: it never shows the
 * website's landing page. Everyone else sees the landing page.
 */
export function StandaloneLoginGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { ready, user } = useSocial();
  const platform = useInstallPlatform();
  const loginPath = appHomeLoginPath(platform, useNativeApp());
  // Blank while the session loads too, so the landing page never flashes.
  const holding = loginPath !== null && !user && pathname === "/";
  const needsLogin = holding && ready;

  useEffect(() => {
    if (needsLogin && loginPath) router.replace(loginPath);
  }, [needsLogin, loginPath, router]);

  if (holding) return <div className="min-h-dvh bg-[var(--background)]" />;
  return <>{children}</>;
}
