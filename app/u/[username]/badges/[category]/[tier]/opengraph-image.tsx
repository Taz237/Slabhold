import { notFound } from "next/navigation";
import { ogContentType, ogSize, reachableShare, renderOg } from "@/components/og-frame";
import { earnedOnLabel } from "@/lib/badges/share";
import { loadBadgeShare } from "@/lib/social/link-preview-load";
import { badgeShareImage } from "@/lib/social/share-image";

export const alt = "Badge on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; category: string; tier: string }>;
}) {
  const { username, category, tier } = await params;
  const view = await loadBadgeShare(decodeURIComponent(username), category, tier);
  if (!view) notFound();
  return renderOg(await reachableShare(badgeShareImage({ ...view, earnedLabel: earnedOnLabel(view.earnedAt) })));
}
