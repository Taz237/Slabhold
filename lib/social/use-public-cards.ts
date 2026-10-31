"use client";

import { useEffect } from "react";
import { useSocial } from "@/components/social-provider";
import { publicCardKeys, type PublicCardRequest } from "./public-card-cache";

/**
 * Reads the public cards a screen part needs (by id, owner, or player) into
 * the provider's cache, and says when that read is done. Pass null to ask
 * for nothing. The cards themselves are on useSocial().publicCards.
 */
export function usePublicCards(request: PublicCardRequest | null): { ready: boolean } {
  const { requestPublicCards, publicCardsReady } = useSocial();
  const key = request ? publicCardKeys(request).join("\n") : "";
  useEffect(() => {
    if (key) requestPublicCards(key.split("\n"));
  }, [key, requestPublicCards]);
  return { ready: key ? publicCardsReady(key.split("\n")) : true };
}
