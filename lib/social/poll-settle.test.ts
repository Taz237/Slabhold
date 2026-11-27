import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetSettleThrottle, settleEndedPolls, settleEndedPollsInBackground, SETTLE_EVERY_MS } from "./poll-remote";
import { onPollsSettled } from "./poll-meta";
import { loadSocialSnapshot } from "./remote";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-28T12:00:00Z");

/** Every table read resolves to no rows. settle_ended_polls answers with `settle`. */
function fakeClient(settle: () => Promise<{ data: unknown; error: unknown }>) {
  const tables: string[] = [];
  let settles = 0;
  const empty = { data: [], error: null, count: 0 };
  const chain = (): unknown =>
    new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: unknown) => void) => resolve(empty);
        return () => chain();
      },
      apply: () => chain(),
    });
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: VIEWER, email: "a@b.c" } } } }) },
    from(table: string) {
      tables.push(table);
      return chain();
    },
    rpc(name: string) {
      if (name === "settle_ended_polls") {
        settles += 1;
        return settle();
      }
      return chain();
    },
    storage: { from: () => chain() },
  };
  return { client: client as unknown as SupabaseClient, tables, settles: () => settles };
}

const never = () => new Promise<{ data: unknown; error: unknown }>(() => {});
const answer = (data: unknown, error: unknown = null) => () => Promise.resolve({ data, error });

beforeEach(() => resetSettleThrottle());

describe("settling ended polls in the background", () => {
  it("loads notifications without waiting for the settle", async () => {
    const { client, tables, settles } = fakeClient(never);
    const loaded = await Promise.race([
      loadSocialSnapshot(client).then(() => "loaded"),
      new Promise((resolve) => setTimeout(() => resolve("stuck"), 2_000)),
    ]);
    assert.equal(loaded, "loaded", "a settle that never answers doesn't hold up the inbox");
    assert.ok(tables.includes("notifications"));
    assert.equal(settles(), 1, "the settle still started");
  });

  it("runs at most once every 5 minutes per person", async () => {
    const { client, settles } = fakeClient(answer(0));
    await settleEndedPollsInBackground(client, VIEWER, NOW);
    await settleEndedPollsInBackground(client, VIEWER, NOW + 60_000);
    await settleEndedPollsInBackground(client, VIEWER, NOW + SETTLE_EVERY_MS - 1);
    assert.equal(settles(), 1);
    await settleEndedPollsInBackground(client, "someone-else", NOW + 60_000);
    assert.equal(settles(), 2, "another person has their own clock");
    await settleEndedPollsInBackground(client, VIEWER, NOW + SETTLE_EVERY_MS);
    assert.equal(settles(), 3, "again after 5 minutes");
    assert.equal(SETTLE_EVERY_MS, 5 * 60_000);
  });

  it("throttles across snapshot loads too", async () => {
    const { client, settles } = fakeClient(answer(0));
    await loadSocialSnapshot(client);
    await loadSocialSnapshot(client);
    await loadSocialSnapshot(client);
    assert.equal(settles(), 1);
  });

  it("asks for a notifications refresh only when it wrote a notice", async () => {
    const heard: string[] = [];
    const stop = onPollsSettled((viewerId) => heard.push(viewerId));
    try {
      await settleEndedPollsInBackground(fakeClient(answer(0)).client, VIEWER, NOW);
      assert.deepEqual(heard, [], "nothing settled, nothing to refresh");
      await settleEndedPollsInBackground(fakeClient(answer(2)).client, VIEWER, NOW + SETTLE_EVERY_MS);
      assert.deepEqual(heard, [VIEWER], "refreshed once");
    } finally {
      stop();
    }
  });

  it("swallows errors and counts them as 0", async () => {
    assert.equal(await settleEndedPolls(fakeClient(answer(null, { message: "boom" })).client), 0);
    assert.equal(await settleEndedPolls(fakeClient(() => Promise.reject(new Error("offline"))).client), 0);
    assert.equal(await settleEndedPolls(fakeClient(answer(3)).client), 3);
  });

  it("is wired to the provider's inbox refresh", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /onPollsSettled\(\(viewerId\) => \{\s*if \(snapshotRef\.current\.user\?\.id === viewerId\) void refreshInbox\(\)/);
  });
});
