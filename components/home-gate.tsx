"use client";

import type { ReactNode } from "react";
import { LandingPage } from "@/components/landing-page";
import { useSocial } from "@/components/social-provider";
import type { FounderShowcase } from "@/lib/landing/founder";

/** Home: the landing page for signed-out visitors, the timeline for everyone else. */
export function HomeGate({ founder, children }: { founder: FounderShowcase | null; children: ReactNode }) {
  const { user } = useSocial();
  if (!user) return <LandingPage founder={founder} />;
  return <>{children}</>;
}
