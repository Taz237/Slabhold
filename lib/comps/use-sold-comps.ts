"use client";

import { useEffect, useState } from "react";
import type { SoldCompCard, SoldCompsPayload } from "./types";

type SoldCompsState = {
  status: "idle" | "loading" | "ready" | "auth_required" | "rate_limited";
  data: SoldCompsPayload | null;
  message: string | null;
};

const empty: SoldCompsState = { status: "idle", data: null, message: null };

export function useSoldComps(card: SoldCompCard | null) {
  const [state, setState] = useState<SoldCompsState>(empty);

  const id = card?.id ?? "";
  const playerName = card?.playerName ?? "";
  const year = card?.year ?? 0;
  const setBrand = card?.setBrand ?? "";
  const cardNumber = card?.cardNumber ?? "";
  const grade = card?.grade ?? "";
  const parallel = card?.parallel ?? "";
  const estimatedSellPrice = card?.estimatedSellPrice ?? 0;

  useEffect(() => {
    if (!id || !playerName || !setBrand || !year) {
      setState(empty);
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null, message: null });

    const params = new URLSearchParams({
      id,
      player: playerName,
      year: String(year),
      set: setBrand,
    });
    if (cardNumber) params.set("number", cardNumber);
    if (grade) params.set("grade", grade);
    if (parallel) params.set("parallel", parallel);
    if (estimatedSellPrice) params.set("est", String(estimatedSellPrice));

    fetch(`/api/comps/sold?${params}`, { signal: controller.signal })
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
            message:
              body.error ||
              "You're checking sold comps too quickly. Please wait a bit and try again.",
          });
          return;
        }
        if (!res.ok) {
          throw new Error(body.error || "Could not load sold comps");
        }
        setState({ status: "ready", data: body, message: null });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({
          status: "ready",
          data: {
            comps: [],
            history: [],
            median: null,
            p25: null,
            p75: null,
            count: 0,
            source: "sample",
            cached: false,
            fetchedAt: null,
            query: "",
            lowConfidence: true,
            sample: true,
          },
          message: null,
        });
      });

    return () => controller.abort();
  }, [
    id,
    playerName,
    year,
    setBrand,
    cardNumber,
    grade,
    parallel,
    estimatedSellPrice,
  ]);

  return state;
}
