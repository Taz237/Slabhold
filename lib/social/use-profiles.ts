"use client";

import { useCallback, useEffect } from "react";
import { useSocial } from "@/components/social-provider";
import { profileKeys, type ProfileRequest } from "./profile-cache";

/**
 * Reads the people a screen names (by id or handle) into useSocial().profiles,
 * and says when that read is done, so a screen can wait instead of showing
 * "not found" for someone who simply isn't loaded yet. Null asks for nothing.
 */
export function useProfiles(request: ProfileRequest | null): {
  ready: boolean;
  /** The read failed: not ready, and nobody is missing. `retry` reads again. */
  failed: boolean;
  retry: () => void;
} {
  const { requestProfiles, profilesReady, profilesFailed } = useSocial();
  const key = request ? profileKeys(request).join("\n") : "";
  useEffect(() => {
    if (key) requestProfiles(key.split("\n"));
  }, [key, requestProfiles]);
  const retry = useCallback(() => {
    if (key) requestProfiles(key.split("\n"));
  }, [key, requestProfiles]);
  return {
    ready: key ? profilesReady(key.split("\n")) : true,
    failed: key ? profilesFailed(key.split("\n")) : false,
    retry,
  };
}
