"use client";

import { useSocial } from "@/components/social-provider";
import type { PublicCollector } from "@/lib/invites/public-collector";
import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";

/**
 * The server's public read of a collector. Without Supabase (local mode) the
 * server has nothing to read, so the accounts on this device stand in. Hosted
 * mode never falls back: what the server couldn't read stays generic.
 */
export function usePublicCollector(
  handle: string | null,
  server: PublicCollector | null,
  cardLimit: number,
): PublicCollector | null {
  const { mode, ready, profiles, publicCards, followerCount } = useSocial();
  if (server || !handle || !ready || mode !== "local") return server;
  const profile = profiles.find((item) => item.username.toLowerCase() === handle);
  if (!profile || isOfficialUpdatesAccount(profile.id)) return null;
  const cards = publicCards
    .filter((card) => card.ownerId === profile.id)
    .sort((a, b) => b.estimatedSellPrice - a.estimatedSellPrice);
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarDataUrl,
    followerCount: followerCount(profile.id),
    publicCardCount: cards.length,
    cards: cards.slice(0, cardLimit),
  };
}
