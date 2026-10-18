import { ogContentType, ogSize, reachableImage, renderOg } from "@/components/og-frame";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";

export const alt = "Profile on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  const preview = await loadOwnProfilePreview();
  const imageUrl = await reachableImage(preview.imageUrl);
  return renderOg({ ...preview, imageUrl }, "COLLECTOR");
}
