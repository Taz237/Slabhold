import type { Metadata } from "next";
import { AccountDeletedToast } from "@/components/account-deleted-toast";
import { LandingPage } from "@/components/landing-page";
import { StandaloneRedirect } from "@/components/landing/standalone-redirect";
import { founderShowcase } from "@/lib/landing/founder-page";

/**
 * Signed-out Home. proxy.ts serves this at / when there is no session cookie;
 * the address bar stays /. It sits outside app/(app), so visitors download
 * none of the app: no providers, supabase-js, timeline or composer. Public
 * data only, so it is cached like Home always was.
 */
export const revalidate = 1800;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Welcome() {
  const founder = await founderShowcase();
  return (
    <>
      <AccountDeletedToast />
      <StandaloneRedirect />
      <LandingPage founder={founder} />
    </>
  );
}
