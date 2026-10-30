import { CARD_OG_CACHE_CONTROL, ogContentType, ogSize, reachableShare, renderOg } from "@/components/og-frame";
import { loadCardShareImage } from "@/lib/social/link-preview-load";

export const alt = "Card on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}) {
  const { id } = await params;
  return renderOg(await reachableShare(await loadCardShareImage(id)), CARD_OG_CACHE_CONTROL);
}
