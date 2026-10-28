import { ogContentType, ogSize, reachableShare, renderOg } from "@/components/og-frame";
import { loadPostShareImage } from "@/lib/social/link-preview-load";

export const alt = "Post on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderOg(await reachableShare(await loadPostShareImage(id)));
}
