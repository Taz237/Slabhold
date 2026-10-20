import { ogContentType, ogSize, reachableImage, renderOg } from "@/components/og-frame";
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
  const preview = await loadCardShareImage(id);
  const imageUrl = await reachableImage(preview.imageUrl);
  return renderOg({ ...preview, imageUrl, photoFallback: !imageUrl });
}
