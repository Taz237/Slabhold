import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("perf pass: fewer waits per screen", () => {
  it("checks the session with Supabase Auth once per request, not once per helper", () => {
    const server = read("lib/supabase/server.ts");
    assert.match(server, /import \{ cache \} from "react";/);
    assert.match(server, /export const getAuthUser = cache\(/);
    const viewer = read("lib/supabase/request-viewer.ts");
    assert.match(viewer, /import \{ cache \} from "react";/);
    assert.match(viewer, /export const requestViewer = cache\(/);
  });

  it("public profile looks up the profile and the viewer at the same time", () => {
    const page = read("app/(app)/u/[username]/page.tsx");
    assert.match(page, /Promise\.all\(\[\s*requireProfile\(username\),\s*getAuthUserId\(\)/);
  });

  it("Collection draws the cards first and reads prices in the browser after", () => {
    const seed = read("lib/collection/load-viewer-seed.ts");
    assert.doesNotMatch(seed, /readCardValues|lookupAllowedIds|consumeCardValueLimit/);
    assert.match(seed, /values: null/);
  });

  it("want alerts for fresh sales go out after the response, not before it", () => {
    const comps = read("lib/comps/index.ts");
    assert.match(comps, /await runAfterResponse\(async \(\) => \{\s*try \{\s*await notifyMatchedSales\(/);
    assert.equal(comps.match(/notifyMatchedSales\(/g)?.length, 1, "only the deferred call");
  });

  it("ships the feed index as one unapplied migration for review", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(dir).find((name) => name.endsWith("_perf_feed_indexes.sql"));
    assert.ok(file, "migration file exists");
    const sql = readFileSync(join(dir, file), "utf8");
    assert.match(sql.split("\n")[0], /^-- UNAPPLIED\. Needs review before running\./);
    assert.match(sql, /on public\.posts \(created_at desc, id\)/);
    assert.match(sql, /create index if not exists/);
    assert.doesNotMatch(sql, /\bdrop\b|\balter policy\b|\bcreate policy\b/i, "indexes only");
  });
});

describe("perf pass: leaderboard", () => {
  it("reads the viewer while the shared boards load, not after", async () => {
    await import("@/lib/test/server-only-stub");
    const { getLeaderboardPage } = await import("@/lib/leaderboard/load");
    const order: string[] = [];
    let releaseSnapshot!: () => void;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const page = getLeaderboardPage(
      { now: new Date("2026-11-11T12:00:00Z") },
      {
        snapshot: async () => {
          order.push("snapshot:start");
          await snapshotGate;
          order.push("snapshot:end");
          throw new Error("no boards in this test");
        },
        viewer: async () => {
          order.push("viewer:start");
          return { ok: true, userId: null, hiddenIds: [] };
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...order].sort(), ["snapshot:start", "viewer:start"], "both started before the boards finished");
    releaseSnapshot();
    const model = await page;
    assert.ok(model, "a failed snapshot still returns the unavailable board");
  });
});
