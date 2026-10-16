"use client";

import { useEffect, useState } from "react";
import type { SoldCompsPayload } from "./types";

export type SoldCompsState = {
  status:
    | "idle"
    | "loading"
    | "ready"
    | "auth_required"
    | "rate_limited"
    | "unavailable";
  data: SoldCompsPayload | null;
  message: string | null;
};

const empty: SoldCompsState = { status: "idle", data: null, message: null };

const UNAVAILABLE = "Sold data unavailable, try again shortly";

/** Fetch comps once per card id. Card details are loaded server-side. */
export function useSoldComps(cardId: string | null) {
  const [state, setState] = useState<SoldCompsState>(empty);

  useEffect(() => {
    if (!cardId) {
      setState(empty);
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null, message: null });

    fetch(`/api/comps/sold?id=${encodeURIComponent(cardId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as SoldCompsPayload & { error?: string };
        if (controller.signal.aborted) return;

        if (res.status === 401) {
          setState({
            status: "auth_required",
            data: null,
            message: body.error || "Log in to see sold comps",
          });
          return;
        }
        if (res.status === 429) {
          setState({
            status: "rate_limited",
            data: null,
            message: body.error || UNAVAILABLE,
          });
          return;
        }
        if (!res.ok) {
          setState({
            status: "unavailable",
            data: null,
            message: body.error || UNAVAILABLE,
          });
          return;
        }
        setState({ status: "ready", data: body, message: null });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          data: null,
          message: UNAVAILABLE,
        });
      });

    return () => controller.abort();
  }, [cardId]);

  return state;
}
