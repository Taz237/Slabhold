import {
  ogContentType,
  ogSize,
  PRIVATE_OG_CACHE_CONTROL,
  reachableImage,
  renderProfileOg,
} from "@/components/og-frame";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";

export const alt = "Profile on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  const preview = await loadOwnProfilePreview();
  const imageUrl = await reachableImage(preview.imageUrl);
  return renderProfileOg({ ...preview, imageUrl }, "COLLECTOR", PRIVATE_OG_CACHE_CONTROL);
}
