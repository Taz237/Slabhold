import { PORTRAIT } from "@/components/og-share";
import { CARD_OG_CACHE_CONTROL, reachableShare, renderOg } from "@/components/og-frame";
import { loadCardShareImage } from "@/lib/social/link-preview-load";
import { isGenericCardImage } from "@/lib/social/share-image";
import { saveImageHeaders } from "@/lib/share/save-image";

export const runtime = "nodejs";

/** 1080×1350 card image for Instagram. Private or missing cards are a 404, never a picture. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await loadCardShareImage(id);
  if (isGenericCardImage(model)) {
    return new Response("Not found", { status: 404 });
  }
  const image = await renderOg(await reachableShare(model), CARD_OG_CACHE_CONTROL, PORTRAIT);
  return new Response(image.body, {
    status: 200,
    headers: saveImageHeaders("slabhold-card.png", CARD_OG_CACHE_CONTROL),
  });
}
