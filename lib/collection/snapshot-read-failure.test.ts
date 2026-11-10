import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  computeCollectionTotals,
  upsertTodaysCollectionSnapshot,
} from "./totals";
import { CardValuesReadError, getCardValues } from "@/lib/value/getCardValue";

/**
 * A fake Supabase REST API. No network, no real project: every request lands
 * here, and writes are only recorded.
 */
type Call = { method: string; table: string };
const calls: Call[] = [];
let cardRows: Record<string, unknown>[] = [];
let valuesFail = false;
let valueRows: Record<string, unknown>[] = [];

const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetch: globalThis.fetch,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

before(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    calls.push({ method, table });
    if (table === "cards") return json(cardRows);
    if (table === "card_values") {
      if (valuesFail) return json({ message: "statement timeout", code: "57014" }, 500);
      return json(valueRows);
    }
    if (method === "GET") return json([]);
    return json(null, 201);
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = saved.fetch;
  for (const [key, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", saved.url],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", saved.anon],
    ["SUPABASE_SERVICE_ROLE_KEY", saved.service],
  ] as const) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  calls.length = 0;
  valuesFail = false;
  valueRows = [];
  cardRows = [];
});

function cardRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: "user-fixture",
    player: "Fixture Player",
    year: 2024,
    set_name: "Prizm",
    card_number: "1",
    grade: "Raw",
    parallel: "Base",
    sport: "Basketball",
    paid_price: 20,
    purchase_date: "2024-01-01",
    sell_price: null,
    sell_date: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...extra,
  };
}

function writes(table: string) {
  return calls.filter((call) => call.table === table && call.method !== "GET");
}

describe("collection snapshot when the card_values read fails", () => {
  it("does not upsert collection_snapshots or card_value_snapshots", async () => {
    cardRows = [cardRow("card-a"), cardRow("card-b")];
    valuesFail = true;
    await assert.rejects(upsertTodaysCollectionSnapshot("user-fixture"), CardValuesReadError);
    assert.ok(calls.some((call) => call.table === "card_values"), "values were read");
    assert.deepEqual(writes("collection_snapshots"), []);
    assert.deepEqual(writes("card_value_snapshots"), []);
  });

  it("computeCollectionTotals throws instead of reporting $0", async () => {
    cardRows = [cardRow("card-a")];
    valuesFail = true;
    await assert.rejects(computeCollectionTotals("user-fixture"), CardValuesReadError);
  });

  it("display reads still show no values on a failed read", async () => {
    valuesFail = true;
    const values = await getCardValues(["card-a"]);
    assert.equal(values.size, 0);
  });
});

describe("collection snapshot after a successful read", () => {
  it("still writes a truly empty collection as $0", async () => {
    cardRows = [];
    const totals = await upsertTodaysCollectionSnapshot("user-fixture");
    assert.deepEqual(totals, { value: 0, invested: 0, profit: 0 });
    assert.equal(writes("collection_snapshots").length, 1);
  });

  it("writes a collection whose cards have no stored values", async () => {
    cardRows = [cardRow("card-a")];
    valueRows = [];
    const totals = await upsertTodaysCollectionSnapshot("user-fixture");
    assert.equal(totals?.value, 0);
    assert.equal(writes("collection_snapshots").length, 1);
    assert.equal(writes("card_value_snapshots").length, 1);
  });

  it("writes the real total from card_values", async () => {
    cardRows = [cardRow("card-a")];
    valueRows = [
      {
        card_id: "card-a",
        median: 75,
        low: 60,
        high: 90,
        n_sales: 6,
        status: "ok",
        query_key: null,
        matched_at: "2026-11-01T00:00:00.000Z",
      },
    ];
    const totals = await upsertTodaysCollectionSnapshot("user-fixture");
    assert.equal(totals?.value, 75);
    assert.equal(writes("collection_snapshots").length, 1);
  });
});
