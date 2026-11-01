"use client";

import { useEffect, useRef, useState } from "react";
import { createReturnRecheck } from "@/lib/social/return-recheck";

/**
 * Calls `onReturn` once each time the reader comes back to this screen:
 * Back from a post (the timeline was drawn from memory), a back-forward
 * cache restore, or the tab after more than ~30s away. It only asks; what
 * is on screen and the scroll spot stay as they are.
 */
export function useReturnRecheck({
  enabled,
  fromMemory,
  onReturn,
}: {
  enabled: boolean;
  fromMemory: boolean;
  onReturn: () => void;
}) {
  const [recheck] = useState(createReturnRecheck);
  const onReturnRef = useRef(onReturn);
  const mountedCheck = useRef(false);

  useEffect(() => {
    onReturnRef.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    if (!enabled || mountedCheck.current) return;
    mountedCheck.current = true;
    if (recheck.mounted(fromMemory, Date.now())) onReturnRef.current();
  }, [enabled, fromMemory, recheck]);

  useEffect(() => {
    if (!enabled) return;
    function onVisibility() {
      if (document.visibilityState === "hidden") recheck.hidden(Date.now());
      else if (recheck.visible(Date.now())) onReturnRef.current();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (recheck.pageShow(event.persisted, Date.now())) onReturnRef.current();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled, recheck]);
}

