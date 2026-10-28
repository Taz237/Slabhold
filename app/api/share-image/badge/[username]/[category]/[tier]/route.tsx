import { PORTRAIT } from "@/components/og-share";
import { PUBLIC_OG_CACHE_CONTROL, reachableShare, renderOg } from "@/components/og-frame";
import { earnedOnLabel } from "@/lib/badges/share";
import { loadBadgeShare } from "@/lib/social/link-preview-load";
import { badgeShareImage } from "@/lib/social/share-image";
import { saveImageHeaders } from "@/lib/share/save-image";

export const runtime = "nodejs";

/** 1080×1350 badge image for Instagram. Same 404 rules as the badge page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; category: string; tier: string }> },
) {
  const { username, category, tier } = await params;
  const view = await loadBadgeShare(decodeURIComponent(username), category, tier);
  if (!view) return new Response("Not found", { status: 404 });
  const image = await renderOg(
    await reachableShare(badgeShareImage({ ...view, earnedLabel: earnedOnLabel(view.earnedAt) })),
    PUBLIC_OG_CACHE_CONTROL,
    PORTRAIT,
  );
  return new Response(image.body, {
    status: 200,
    headers: saveImageHeaders(`slabhold-${view.tier}-${view.category}.png`, PUBLIC_OG_CACHE_CONTROL),
  });
}
