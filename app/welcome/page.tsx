import type { Metadata } from "next";
import { AccountDeletedToast } from "@/components/account-deleted-toast";
import { LandingPage } from "@/components/landing-page";
import { LandingCompProvider } from "@/components/landing/landing-links";
import { StandaloneRedirect } from "@/components/landing/standalone-redirect";
import { WelcomeListeners } from "@/components/landing/welcome-listeners";
import { landingCompDemo } from "@/lib/landing/founder-comp-load";
import { welcomeFounderShowcase } from "@/lib/landing/founder-page";

/**
 * Signed-out Home. proxy.ts serves this at / when there is no session cookie;
 * the address bar stays /. It sits outside app/(app), so visitors download
 * none of the app: no providers, supabase-js, timeline or composer. Public
 * data only, so it is cached like Home always was.
 */
export const revalidate = 1800;
// A failed founder read throws here at runtime: the last good page stays up
// and the next request retries (see welcomeFounderShowcase).

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Welcome() {
  // Both cached reads run at once.
  const compRead = landingCompDemo();
  const founder = await welcomeFounderShowcase();
  const comp = await compRead;
  return (
    <>
      <AccountDeletedToast />
      <StandaloneRedirect />
      <WelcomeListeners />
      <LandingCompProvider comp={comp}>
        <LandingPage founder={founder} />
      </LandingCompProvider>
    </>
  );
}
