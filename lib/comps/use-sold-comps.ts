"use client";

import { useEffect, useState } from "react";
import type { SoldCompCard, SoldCompsPayload } from "./types";

type SoldCompsState = {
  status: "idle" | "loading" | "ready";
  data: SoldCompsPayload | null;
};

const empty: SoldCompsState = { status: "idle", data: null };

export function useSoldComps(card: SoldCompCard | null) {
  const [state, setState] = useState<SoldCompsState>(empty);

  const id = card?.id ?? "";
  const playerName = card?.playerName ?? "";
  const year = card?.year ?? 0;
  const setBrand = card?.setBrand ?? "";
  const cardNumber = card?.cardNumber ?? "";
  const grade = card?.grade ?? "";
  const estimatedSellPrice = card?.estimatedSellPrice ?? 0;

  useEffect(() => {
    if (!id || !playerName || !setBrand || !year) {
      setState(empty);
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null });

    const params = new URLSearchParams({
      id,
      player: playerName,
      year: String(year),
      set: setBrand,
    });
    if (cardNumber) params.set("number", cardNumber);
    if (grade) params.set("grade", grade);
    if (estimatedSellPrice) params.set("est", String(estimatedSellPrice));

    fetch(`/api/comps/sold?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as SoldCompsPayload;
        if (!res.ok) {
          throw new Error("Could not load sold comps");
        }
        if (!controller.signal.aborted) {
          setState({ status: "ready", data: body });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Silent fallback: UI treats null/sample as sample banner.
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
        });
      });

    return () => controller.abort();
  }, [id, playerName, year, setBrand, cardNumber, grade, estimatedSellPrice]);

  return state;
}
