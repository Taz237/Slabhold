import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { LANDING_DESCRIPTION, LANDING_OPEN_GRAPH, LANDING_TITLE, LANDING_TWITTER } from "@/lib/landing/seo";
import { landingTimelinePosts } from "@/lib/landing/timeline-load";
import { requestHomeSeed } from "@/lib/social/request-home-seed";
import { isRouterRequest } from "@/lib/supabase/router-request";

/** The same words as /welcome, which a signed-out visitor is served at this address. */
export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  openGraph: { ...LANDING_OPEN_GRAPH, images: [...LANDING_OPEN_GRAPH.images] },
  twitter: { ...LANDING_TWITTER, images: [...LANDING_TWITTER.images] },
};

/**
 * The landing page is a server component: its HTML ships, its code doesn't.
 *
 * Home renders per request: a signed-in load streams the timeline's first
 * screen (see requestHomeSeed). Only the landing data is cached. Nothing per
 * viewer is.
 */
export default async function Home() {
  // A few recent public posts for the landing page, cached.
  const posts = await landingTimelinePosts();
  // A visit from inside the app already has the timeline in memory.
  const landing = <LandingPage posts={posts} />;
  if (await isRouterRequest()) return <HomeGate landing={landing} />;
  return (
    <Suspense fallback={<HomeGate landing={null} />}>
      <SeededHome landing={landing} />
    </Suspense>
  );
}

async function SeededHome({ landing }: { landing: React.ReactNode }) {
  const seed = await requestHomeSeed();
  return <HomeGate landing={landing} seed={seed} />;
}
