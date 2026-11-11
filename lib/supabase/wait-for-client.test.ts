import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waitForClient } from "@/lib/supabase/wait-for-client";

describe("waitForClient", () => {
  it("returns the client once it loads", async () => {
    const client = { id: "c" };
    assert.equal(await waitForClient(async () => client, 1000), client);
  });

  it("gives null when loading fails, instead of throwing", async () => {
    assert.equal(await waitForClient(() => Promise.reject(new Error("chunk")), 1000), null);
  });

  it("gives null when loading takes too long", async () => {
    const started = Date.now();
    assert.equal(await waitForClient(() => new Promise(() => {}), 30), null);
    assert.ok(Date.now() - started < 1000);
  });
});
