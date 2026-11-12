import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { LiveSoldsInput } from "./live-solds";
import { LIVE_SOLDS_RATE_MESSAGE, respondLiveSolds, rowsFromBody, type LiveSoldsRouteDeps } from "./live-solds-respond";

const url = "https://slabhold.test/api/scan/solds";

function post(body: unknown) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function route(overrides: Partial<LiveSoldsRouteDeps> = {}) {
  const seen: LiveSoldsInput[] = [];
  const value: LiveSoldsRouteDeps = {
    enabled: () => true,
    userId: async () => "viewer",
    allow: async () => true,
    lookup: async (input) => {
      seen.push(input);
      return { matches: [], comp: { status: "none" }, query: null };
    },
    ...overrides,
  };
  return { value, seen };
}

describe("respondLiveSolds", () => {
  it("is a 404 when the scanner is off, and needs a signed-in collector", async () => {
    assert.equal((await respondLiveSolds(post({ lines: ["X"] }), route({ enabled: () => false }).value)).status, 404);
    assert.equal((await respondLiveSolds(post({ lines: ["X"] }), route({ userId: async () => null }).value)).status, 401);
  });

  it("needs the read text, and checks it before any lookup", async () => {
    const { value, seen } = route();
    assert.equal((await respondLiveSolds(post({}), value)).status, 400);
    assert.equal((await respondLiveSolds(post({ lines: [] }), value)).status, 400);
    assert.equal((await respondLiveSolds(new Request(url, { method: "POST", body: "nope" }), value)).status, 400);
    assert.equal(seen.length, 0);
  });

  it("caps a runaway loop of requests", async () => {
    const { value, seen } = route({ allow: async () => false });
    const response = await respondLiveSolds(post({ lines: ["AIDAN MILLER"] }), value);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, LIVE_SOLDS_RATE_MESSAGE);
    assert.equal(seen.length, 0);
  });

  it("passes the lines, back lines and kind, and never a photo", async () => {
    const { value, seen } = route();
    const response = await respondLiveSolds(
      post({ lines: ["AIDAN MILLER"], backLines: ["BP-27"], kind: "card", image: "data:image/jpeg;base64,QUJD" }),
      value,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(seen[0].capture, { lines: ["AIDAN MILLER"], backLines: ["BP-27"], kind: "card", border: null });
  });

  it("keeps at most three catalog rows, with ids", () => {
    const rows = rowsFromBody([
      { catalogId: "a", playerName: "Jaxson Dart", setBrand: "Panini Prizm", cardNumber: "332", yearLabel: "2025" },
      { catalogId: null, playerName: "Jaxson Dart" },
      { catalogId: "b", playerName: "Jaxson Dart" },
      { catalogId: "c", playerName: "Jaxson Dart" },
      { catalogId: "d", playerName: "Jaxson Dart" },
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
    assert.equal(rows[0].parallel, "Base");
  });
});

describe("the live lookup's secrets stay on the server", () => {
  it("never puts the Trawl key in the client or a log", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    for (const path of ["lib/scan/live-solds.ts", "lib/scan/live-search.ts", "lib/scan/live-solds-respond.ts", "components/scan/scan-hub.tsx"]) {
      assert.doesNotMatch(read(path), /TRAWL_API_KEY|getTrawlApiKey|console\.(log|info|warn)/, path);
    }
    assert.match(read("lib/scan/live-solds-server.ts"), /^import "server-only";/);
    assert.match(read("app/api/scan/solds/route.ts"), /serverLiveSoldsDeps/);
  });
});
