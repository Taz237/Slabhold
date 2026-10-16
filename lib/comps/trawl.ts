import "server-only";

import type { TrawlSoldResponse } from "./types";

const TRAWL_SOLD_URL = "https://api.trawl.dev/ebay/v1/sold";

export function getTrawlApiKey() {
  return process.env.TRAWL_API_KEY?.trim() || "";
}

export type TrawlFetchResult =
  | { ok: true; body: TrawlSoldResponse; rateLimitRemaining: string | null }
  | {
      ok: false;
      status: number;
      error: string;
      outOfCredits: boolean;
      rateLimitRemaining: string | null;
    };

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildSoldQuery(card: {
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber?: string;
  grade?: string;
}): string {
  const number = (card.cardNumber ?? "").replace(/^#/, "").trim();
  const parts = [
    String(card.year),
    card.setBrand.trim(),
    card.playerName.trim(),
    number ? `#${number}` : "",
    (card.grade ?? "").trim(),
  ];
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchTrawlSold(
  query: string,
  options?: { days?: number; maxPages?: number },
): Promise<TrawlFetchResult> {
  const key = getTrawlApiKey();
  if (!key) {
    return {
      ok: false,
      status: 0,
      error: "TRAWL_API_KEY is not set",
      outOfCredits: false,
      rateLimitRemaining: null,
    };
  }

  const days = options?.days ?? 90;
  const maxPages = options?.maxPages ?? 1;
  const params = new URLSearchParams({
    query,
    site: "EBAY_US",
    date_from: daysAgoIso(days),
    max_pages: String(maxPages),
    details: "1",
  });

  const response = await fetch(`${TRAWL_SOLD_URL}?${params}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
  });

  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  if (rateLimitRemaining != null) {
    console.info("[trawl] X-RateLimit-Remaining:", rateLimitRemaining);
  }

  const body = (await response.json().catch(() => ({}))) as TrawlSoldResponse & {
    error?: string;
  };

  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    const outOfCredits = response.status === 429 && !retryAfter;
    return {
      ok: false,
      status: response.status,
      error: body.error || `Trawl request failed (${response.status})`,
      outOfCredits,
      rateLimitRemaining,
    };
  }

  return { ok: true, body, rateLimitRemaining };
}
