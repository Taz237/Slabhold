import { ogContentType, ogSize, reachableImage, renderProfileOg } from "@/components/og-frame";
import { loadProfilePreview } from "@/lib/social/link-preview-load";

export const alt = "Collector on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const preview = await loadProfilePreview(username);
  const imageUrl = await reachableImage(preview.imageUrl);
  return renderProfileOg({ ...preview, imageUrl }, "COLLECTOR");
}
