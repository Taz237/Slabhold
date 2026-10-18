import { ogContentType, ogSize, reachableImage, renderOg } from "@/components/og-frame";
import { loadPostPreview } from "@/lib/social/link-preview-load";

export const alt = "Post on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadPostPreview(id);
  const imageUrl = await reachableImage(preview.imageUrl);
  return renderOg({ ...preview, imageUrl }, "POST");
}
