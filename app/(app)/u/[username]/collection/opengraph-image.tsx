import { ogContentType, ogSize } from "@/components/og-frame";
import { collectionImageResponse } from "@/lib/invites/images";
import { loadCollectionImageCollector } from "@/lib/invites/load";

export const alt = "A card collection on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return collectionImageResponse(await loadCollectionImageCollector(username));
}
