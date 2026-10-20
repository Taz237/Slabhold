import { ogContentType, ogSize, reachableImage, reachableImages, renderOg } from "@/components/og-frame";
import { loadPostShareImage } from "@/lib/social/link-preview-load";

export const alt = "Post on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadPostShareImage(id);
  const imageUrl = await reachableImage(preview.imageUrl);
  const photos = await reachableImages(preview.photos);
  return renderOg({ ...preview, imageUrl, photos });
}
