"use client";

import { useEffect } from "react";
import { useSocial } from "@/components/social-provider";
import { profileKeys, type ProfileRequest } from "./profile-cache";

/**
 * Reads the people a screen names (by id or handle) into useSocial().profiles,
 * and says when that read is done, so a screen can wait instead of showing
 * "not found" for someone who simply isn't loaded yet. Null asks for nothing.
 */
export function useProfiles(request: ProfileRequest | null): { ready: boolean } {
  const { requestProfiles, profilesReady } = useSocial();
  const key = request ? profileKeys(request).join("\n") : "";
  useEffect(() => {
    if (key) requestProfiles(key.split("\n"));
  }, [key, requestProfiles]);
  return { ready: key ? profilesReady(key.split("\n")) : true };
}
