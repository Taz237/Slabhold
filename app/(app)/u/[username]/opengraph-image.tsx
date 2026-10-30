import { CARD_OG_CACHE_CONTROL, ogContentType, ogSize, reachableShare, renderOg } from "@/components/og-frame";
import { loadProfileShareImage } from "@/lib/social/link-preview-load";

export const alt = "Collector on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return renderOg(await reachableShare(await loadProfileShareImage(username)), CARD_OG_CACHE_CONTROL);
}
