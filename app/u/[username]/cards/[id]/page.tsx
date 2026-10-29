import type { Metadata } from "next";
import { PublicCardView } from "@/components/public-card-view";
import { getPublicCardComps } from "@/lib/comps/public";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requirePublicCard } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string; id: string }> };

/**
 * ISR: rendered on first hit, then served from the CDN. Every read here is
 * cookie-free and public. Signed-in parts (own card, message owner,
 * blocked/muted) come from the client social store in PublicCardView.
 * A card made private 404s at once through proxy.ts, which checks
 * public_cards on every request, and this page refreshes within 5 minutes
 * or on a `card:${id}` revalidate.
 */
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { username: string; id: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params;
  const preview = await loadPublicCardPreview(id);
  return withCardOgImage(
    previewMetadata(preview),
    cardOgImagePath(id, preview.updatedAt, username),
  );
}

export default async function PublicCardPage({ params }: Props) {
  const { username, id } = await params;
  // The 404 check and the comps read run together. Comps gate on
  // public_cards on their own, and a 404 throws before anything renders.
  // Owners and hunters are off for now, so the page skips the people query.
  const [, publicComps] = await Promise.all([
    requirePublicCard(username, id),
    getPublicCardComps(id),
  ]);
  return <PublicCardView username={username} id={id} publicComps={publicComps} />;
}
