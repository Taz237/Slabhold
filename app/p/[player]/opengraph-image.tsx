import {
  OG_FAILURE_CACHE_CONTROL,
  PUBLIC_OG_CACHE_CONTROL,
  ogContentType,
  ogSize,
  renderOg,
} from "@/components/og-frame";
import { loadPlayerIdentity } from "@/lib/players/load-hub";
import { playerShareImage } from "@/lib/social/share-image";

export const alt = "Player on Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({
  params,
}: {
  params: Promise<{ player: string }>;
}) {
  const { player } = await params;
  const identity = loadPlayerIdentity(player);
  return renderOg(
    playerShareImage({
      found: identity.found,
      name: identity.name,
      sport: identity.sport,
    }),
    identity.found ? PUBLIC_OG_CACHE_CONTROL : OG_FAILURE_CACHE_CONTROL,
  );
}
