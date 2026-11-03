import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SOLD_UNAVAILABLE_MESSAGE } from "@/lib/comps/sold-response";
import { requiresAccount, routeAccess } from "@/lib/auth/route-access";
import type { QuickCompIdentity } from "./identity";
import {
  QUICK_COMP_DAILY_MESSAGE,
  QUICK_COMP_HOURLY_MESSAGE,
  respondQuickComp,
  type QuickCompRouteDeps,
} from "./respond";

const ok = "https://slabhold.test/api/quick-comp?player=Fixture+Player&year=2023&set=Prizm&number=12&grade=PSA+10";

function deps(overrides: Partial<QuickCompRouteDeps> = {}) {
  const seen: QuickCompIdentity[] = [];
  let authCalls = 0;
  const value: QuickCompRouteDeps = {
    enabled: () => true,
    userId: async () => (authCalls++, "fixture-user"),
    lookup: async (identity) => {
      seen.push(identity);
      return {
        ok: true,
        payload: {
          comps: [],
          history: [],
          median: 40,
          p25: 36,
          p75: 44,
          count: 6,
          source: "sample",
          cached: false,
          fetchedAt: null,
          query: "q",
          lowConfidence: false,
          sample: true,
        },
      };
    },
    ...overrides,
  };
  return { value, seen, auth: () => authCalls };
}

describe("GET /api/quick-comp", () => {
  it("answers 404 with the flag off, before auth and with zero lookups", async () => {
    const d = deps({ enabled: () => false });
    const response = await respondQuickComp(new Request(ok), d.value);
    assert.equal(response.status, 404);
    assert.equal(d.seen.length, 0);
    assert.equal(d.auth(), 0);
  });

  it("is a 404 from the real route when the flag is unset", async () => {
    const saved = process.env.NEXT_PUBLIC_QUICK_COMP;
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches++;
      throw new Error("no network in tests");
    }) as typeof fetch;
    try {
      const { GET } = await import("@/app/api/quick-comp/route");
      const response = await GET(new Request(ok));
      assert.equal(response.status, 404);
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = realFetch;
      if (saved != null) process.env.NEXT_PUBLIC_QUICK_COMP = saved;
    }
  });

  it("answers 401 when signed out", async () => {
    const d = deps({ userId: async () => null });
    const response = await respondQuickComp(new Request(ok), d.value);
    assert.equal(response.status, 401);
    assert.equal(d.seen.length, 0);
  });

  it("answers 400 for a missing player or year, a bad year, a bad grade or an unknown field", async () => {
    for (const query of [
      "year=2023",
      "player=Fixture",
      "player=Fixture&year=23",
      "player=Fixture&year=2023-27",
      "player=Fixture&year=2023&grade=shiny",
      "player=Fixture&year=2023&userId=someone",
    ]) {
      const d = deps();
      const response = await respondQuickComp(new Request(`https://slabhold.test/api/quick-comp?${query}`), d.value);
      assert.equal(response.status, 400, query);
      assert.equal(d.seen.length, 0, query);
    }
  });

  it("clips fields on whole characters and defaults to Raw, Base", async () => {
    const d = deps();
    const long = "A".repeat(200);
    const response = await respondQuickComp(
      new Request(`https://slabhold.test/api/quick-comp?player=${long}&year=2023-24&number=%2312`),
      d.value,
    );
    assert.equal(response.status, 200);
    assert.equal(d.seen[0].playerName.length, 80);
    assert.equal(d.seen[0].yearLabel, "2023-24");
    assert.equal(d.seen[0].year, 2023);
    assert.equal(d.seen[0].cardNumber, "12");
    assert.equal(d.seen[0].grade, "Raw");
    assert.equal(d.seen[0].parallel, "Base");
  });

  it("returns the payload", async () => {
    const response = await respondQuickComp(new Request(ok), deps().value);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.median, 40);
  });

  it("answers 429 with the reason and reset time", async () => {
    for (const reason of ["daily", "hourly"] as const) {
      const resetAt = "2026-11-04T00:00:00.000Z";
      const response = await respondQuickComp(
        new Request(ok),
        deps({ lookup: async () => ({ ok: false, reason, resetAt }) }).value,
      );
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), {
        error: reason === "daily" ? QUICK_COMP_DAILY_MESSAGE : QUICK_COMP_HOURLY_MESSAGE,
        reason,
        resetAt,
      });
    }
  });

  it("answers 503 when sales are unavailable", async () => {
    const response = await respondQuickComp(
      new Request(ok),
      deps({ lookup: async () => ({ ok: false, reason: "unavailable" }) }).value,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: SOLD_UNAVAILABLE_MESSAGE });
  });

  it("caps the route at 15 seconds like the sold route", () => {
    const route = readFileSync(join(process.cwd(), "app/api/quick-comp/route.ts"), "utf8");
    assert.match(route, /export const maxDuration = 15;/);
    assert.match(route, /enabled: \(\) => quickCompEnabled\(\)/);
  });

  it("leaves the shared route table alone, so the shell is the same with the flag off", () => {
    assert.equal(routeAccess("/comp"), "unknown");
    assert.equal(requiresAccount("/comp"), false);
  });
});
