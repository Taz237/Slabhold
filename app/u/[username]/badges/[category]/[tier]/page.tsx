import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeShareView } from "@/components/badges/badge-share-view";
import { loadBadgeShare } from "@/lib/social/link-preview-load";
import { getAuthUserId } from "@/lib/supabase/server";

type Props = { params: Promise<{ username: string; category: string; tier: string }> };

async function load(params: Props["params"]) {
  const { username, category, tier } = await params;
  return loadBadgeShare(decodeURIComponent(username), category, tier);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await load(params);
  if (!view) return { title: "Badge", robots: { index: false } };
  const title = `@${view.username} unlocked ${view.name}`;
  const description = `${view.name} on Slabhold, the home for sports card collectors.`;
  return {
    title: `${view.name} · @${view.username}`,
    description,
    openGraph: { title, description, siteName: "Slabhold" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** A shared badge. 404 when it isn't earned or the collector has badges turned off. */
export default async function BadgeSharePage({ params }: Props) {
  const view = await load(params);
  if (!view) notFound();
  const signedIn = Boolean(await getAuthUserId());
  return <BadgeShareView view={view} signedIn={signedIn} />;
}
