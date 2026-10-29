import { collectionStoryResponse } from "@/lib/invites/images";
import { loadCollectionImageCollector } from "@/lib/invites/load";

export const runtime = "nodejs";

/** 1080×1920 collection image for Instagram Stories. Private or unknown collectors are a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return collectionStoryResponse(await loadCollectionImageCollector(username));
}
