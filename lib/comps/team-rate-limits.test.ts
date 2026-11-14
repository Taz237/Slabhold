import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEAM_BADGE_USERNAMES } from "@/lib/social/team-badge";
import { makeTeamCheck } from "@/lib/social/team-check-server";
import {
  REQUESTS_LIMIT,
  REQUESTS_WINDOW_MS,
  TEAM_REQUESTS_LIMIT,
  TEAM_TRAWL_LIMIT,
  TRAWL_LIMIT,
  TRAWL_WINDOW_MS,
  consumeRequestLimit,
  consumeTrawlLimit,
  type CompsLimitDeps,
} from "./rate-limit";

/**
 * Team badge holders get a high safety cap on sold comps; everyone else keeps
 * 20 per 10 min and 5 Trawl fetches per hour. Mocked usernames and an
 * in-memory bucket store: no database, no Trawl.
 */

const USERNAMES: Record<string, string | null> = {
  "u-donnie": "donnietaz",
  "u-kev": "@KevStuff",
  "u-regular": "cardfan22",
  "u-nameless": null,
};

function memoryLimits(lookup: (userId: string) => Promise<string | null> = async (id) => USERNAMES[id] ?? null) {
  const counts = new Map<string, number>();
  const calls: { bucket: string; windowMs: number; limit: number }[] = [];
  const deps: CompsLimitDeps = {
    isTeam: makeTeamCheck(lookup),
    consume: async (userId, bucket, windowMs, limit) => {
      calls.push({ bucket, windowMs, limit });
      const key = `${userId}|${bucket}`;
      const next = (counts.get(key) ?? 0) + 1;
      if (next > limit) return false;
      counts.set(key, next);
      return true;
    },
  };
  return { deps, calls };
}

async function allowedRun(consume: () => Promise<boolean>, tries: number): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < tries; i++) if (await consume()) allowed++;
  return allowed;
}

describe("team caps on sold comps", () => {
  it("keeps the regular caps and sets a higher, still finite team cap", () => {
    assert.equal(REQUESTS_LIMIT, 20);
    assert.equal(TRAWL_LIMIT, 5);
    assert.equal(TEAM_REQUESTS_LIMIT, 200);
    assert.equal(TEAM_TRAWL_LIMIT, 60);
    assert.ok(Number.isFinite(TEAM_REQUESTS_LIMIT) && Number.isFinite(TEAM_TRAWL_LIMIT));
  });

  it("a regular user is still stopped at 20 requests and 5 Trawl fetches", async () => {
    const { deps } = memoryLimits();
    assert.equal(await allowedRun(() => consumeRequestLimit("u-regular", deps), 50), 20);
    assert.equal(await allowedRun(() => consumeTrawlLimit("u-regular", deps), 50), 5);
  });

  it("a user with no username gets the regular caps", async () => {
    const { deps } = memoryLimits();
    assert.equal(await allowedRun(() => consumeRequestLimit("u-nameless", deps), 50), 20);
    assert.equal(await allowedRun(() => consumeTrawlLimit("u-nameless", deps), 50), 5);
  });

  it("a team user gets past 20 and 5, up to the team safety cap", async () => {
    const { deps } = memoryLimits();
    assert.equal(await allowedRun(() => consumeRequestLimit("u-donnie", deps), 500), 200);
    assert.equal(await allowedRun(() => consumeTrawlLimit("u-donnie", deps), 500), 60);
  });

  it("matches team usernames without case or @", async () => {
    const { deps } = memoryLimits();
    assert.equal(await allowedRun(() => consumeTrawlLimit("u-kev", deps), 100), 60);
  });

  it("every team badge name gets the team cap", async () => {
    for (const username of TEAM_BADGE_USERNAMES) {
      const { deps } = memoryLimits(async () => username);
      assert.equal(await allowedRun(() => consumeTrawlLimit("id", deps), 100), 60, username);
    }
  });

  it("a failed username lookup falls back to the regular caps", async () => {
    const { deps } = memoryLimits(async () => {
      throw new Error("db down");
    });
    assert.equal(await allowedRun(() => consumeRequestLimit("u-donnie", deps), 50), 20);
    assert.equal(await allowedRun(() => consumeTrawlLimit("u-donnie", deps), 50), 5);
  });

  it("team users use the same buckets and windows, only the cap changes", async () => {
    const { deps, calls } = memoryLimits();
    await consumeRequestLimit("u-donnie", deps);
    await consumeTrawlLimit("u-donnie", deps);
    await consumeRequestLimit("u-regular", deps);
    await consumeTrawlLimit("u-regular", deps);
    assert.deepEqual(calls, [
      { bucket: "requests", windowMs: REQUESTS_WINDOW_MS, limit: 200 },
      { bucket: "trawl", windowMs: TRAWL_WINDOW_MS, limit: 60 },
      { bucket: "requests", windowMs: REQUESTS_WINDOW_MS, limit: 20 },
      { bucket: "trawl", windowMs: TRAWL_WINDOW_MS, limit: 5 },
    ]);
  });
});
