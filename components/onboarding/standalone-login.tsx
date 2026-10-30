"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useInstallPlatform } from "@/components/onboarding/use-install-platform";
import { useSocial } from "@/components/social-provider";
import { standaloneLoginPath, standaloneNeedsLogin } from "@/lib/pwa/install-step";

/**
 * Signed-out Home. In the installed app that's usually someone whose Safari
 * login didn't carry over, so they get a short "log in once" screen instead
 * of the landing page. Everyone else sees the landing page.
 */
export function StandaloneLoginGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { ready, user } = useSocial();
  const platform = useInstallPlatform();
  const needsLogin = standaloneNeedsLogin({ platform, ready, signedIn: Boolean(user), pathname });
  // Blank while the session loads too, so the landing page never flashes.
  const holding = platform === "installed" && !user && pathname === "/";

  useEffect(() => {
    if (needsLogin) router.replace(standaloneLoginPath());
  }, [needsLogin, router]);

  if (holding) return <div className="min-h-dvh bg-[var(--background)]" />;
  return <>{children}</>;
}
