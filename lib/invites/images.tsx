import { CARD_OG_CACHE_CONTROL, reachableShare, renderOg } from "@/components/og-frame";
import { STORY } from "@/components/og-share";
import { collectionStoryFilename } from "@/lib/share/links";
import { saveImageHeaders } from "@/lib/share/save-image";
import {
  collectionShareImage,
  inviteShareImage,
  type ShareCollector,
  type ShareImage,
} from "@/lib/social/share-image";
import type { PublicCollector } from "./public-collector";

/** Only what the images may draw: name, handle, avatar, public card photos and count. */
export function shareCollector(collector: PublicCollector | null): ShareCollector | null {
  if (!collector) return null;
  return {
    username: collector.username,
    displayName: collector.displayName,
    avatarUrl: collector.avatarUrl,
    publicCardCount: collector.publicCardCount,
    cards: collector.cards.map((card) => ({
      imageUrl: card.photoDataUrl,
      player: card.playerName,
      year: card.year,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      parallel: card.parallel,
      grade: card.grade,
      grader: card.grader,
      conditionType: card.conditionType,
    })),
  };
}

export function inviteImageModel(collector: PublicCollector | null): ShareImage {
  return inviteShareImage(shareCollector(collector));
}

export function collectionImageModel(collector: PublicCollector | null): ShareImage {
  return collectionShareImage(shareCollector(collector));
}

/** 1200×630. Unknown, reserved and private collectors get the generic invite. Cached like profile images. */
export async function inviteImageResponse(collector: PublicCollector | null) {
  return renderOg(await reachableShare(inviteImageModel(collector)), CARD_OG_CACHE_CONTROL);
}

/** 1200×630 collection preview. Unknown, reserved and private collectors get the generic image. */
export async function collectionImageResponse(collector: PublicCollector | null) {
  return renderOg(await reachableShare(collectionImageModel(collector)), CARD_OG_CACHE_CONTROL);
}

/** 1080×1920 Story PNG, saved as a file. Unknown, reserved or private is a 404, never a picture. */
export async function collectionStoryResponse(collector: PublicCollector | null): Promise<Response> {
  if (!collector) return new Response("Not found", { status: 404 });
  const image = await renderOg(await reachableShare(collectionImageModel(collector)), CARD_OG_CACHE_CONTROL, STORY);
  return new Response(image.body, {
    status: 200,
    headers: saveImageHeaders(collectionStoryFilename(collector.username), CARD_OG_CACHE_CONTROL),
  });
}
