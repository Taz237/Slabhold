import type { Metadata } from "next";
import { AccountDeletedToast } from "@/components/account-deleted-toast";
import { LandingPage } from "@/components/landing-page";
import { StandaloneRedirect } from "@/components/landing/standalone-redirect";
import { WelcomeListeners } from "@/components/landing/welcome-listeners";
import { LANDING_DESCRIPTION, LANDING_OPEN_GRAPH, LANDING_TITLE, LANDING_TWITTER } from "@/lib/landing/seo";
import { landingTimelinePosts } from "@/lib/landing/timeline-load";

/**
 * Signed-out Home. proxy.ts serves this at / when there is no session cookie;
 * the address bar stays /. It sits outside app/(app), so visitors download
 * none of the app: no providers, supabase-js, timeline or composer. Public
 * data only, so it is cached like Home always was.
 */
export const revalidate = 1800;

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { ...LANDING_OPEN_GRAPH, images: [...LANDING_OPEN_GRAPH.images] },
  twitter: { ...LANDING_TWITTER, images: [...LANDING_TWITTER.images] },
};

export default async function Welcome() {
  // A few recent public posts, cached. A failed read draws the page without them.
  const posts = await landingTimelinePosts();
  return (
    <>
      <AccountDeletedToast />
      <StandaloneRedirect />
      <WelcomeListeners />
      <LandingPage posts={posts} />
    </>
  );
}
