import type { TrawlSoldResult } from "@/lib/comps/types";

/**
 * A fake Supabase REST API with an in-memory sold_comps_cache, and a fake
 * Trawl endpoint that only counts calls. Nothing leaves the process.
 * Set COMPS_SOURCE, TRAWL_API_KEY, and Supabase env before importing comps.
 */
export type FakeCompsBackend = {
  trawlCalls: number;
  trawlResults: TrawlSoldResult[];
  cache: Record<string, unknown>[];
  restore: () => void;
};

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COMPS_SOURCE",
  "TRAWL_API_KEY",
] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function matches(row: Record<string, unknown>, params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
    if (!value.startsWith("eq.")) continue;
    if (String(row[key]) !== decodeURIComponent(value.slice(3))) return false;
  }
  return true;
}

export function installFakeCompsBackend(): FakeCompsBackend {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  process.env.COMPS_SOURCE = "trawl";
  process.env.TRAWL_API_KEY = "test-trawl";

  const backend: FakeCompsBackend = {
    trawlCalls: 0,
    trawlResults: [],
    cache: [],
    restore() {
      globalThis.fetch = savedFetch;
      for (const key of ENV_KEYS) {
        if (saved[key] == null) delete process.env[key];
        else process.env[key] = saved[key];
      }
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.trawl.dev") {
      backend.trawlCalls += 1;
      return json({ results: backend.trawlResults, count: backend.trawlResults.length });
    }
    const method = (init?.method ?? "GET").toUpperCase();
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    if (table !== "sold_comps_cache") return method === "GET" ? json([]) : json(null, 201);

    if (method === "DELETE") {
      backend.cache = backend.cache.filter((row) => !matches(row, url.searchParams));
      return new Response(null, { status: 204 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "[]")) as Record<string, unknown>[];
      backend.cache.push(...(Array.isArray(body) ? body : [body]));
      return json(null, 201);
    }
    let rows = backend.cache.filter((row) => matches(row, url.searchParams));
    const order = url.searchParams.get("order");
    if (order?.startsWith("fetched_at.desc")) {
      rows = [...rows].sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)));
    }
    const limit = Number(url.searchParams.get("limit"));
    if (limit > 0) rows = rows.slice(0, limit);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      return rows.length ? json(rows[0]) : json({ message: "no rows", code: "PGRST116" }, 406);
    }
    return json(rows);
  }) as typeof fetch;

  return backend;
}

/** A raw Trawl sold row for a raw card. */
export function trawlRow(
  itemId: string,
  title: string,
  price: number,
  day: number,
  grading: { grader: string | null; grade: string | null } = { grader: null, grade: null },
): TrawlSoldResult {
  const soldAt = `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  return {
    title,
    sale_price: price,
    shipping_price: 0,
    currency: "USD",
    condition: grading.grader ? "graded" : "used",
    condition_raw: grading.grader ? "Graded" : "Pre-Owned",
    date_sold: soldAt,
    buying_format: "Buy It Now",
    item_id: itemId,
    item_link: `https://www.ebay.com/itm/${itemId}`,
    image_url: null,
    details: {
      listing_state: "sold",
      grading: { graded: Boolean(grading.grader), grader: grading.grader, grade: grading.grade, condition: null },
      sales: [{ date_sold: soldAt, sale_price: price, shipping_price: 0, currency: "USD" }],
    },
  } as TrawlSoldResult;
}
