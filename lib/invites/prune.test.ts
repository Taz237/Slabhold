import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { pruneInviteCodeResets } from "./prune";

type RpcError = { code?: string; message: string } | null;

function fakeClient(result: { data?: unknown; error: RpcError } | Error) {
  const calls: unknown[][] = [];
  return {
    calls,
    rpc(...args: unknown[]) {
      calls.push(args);
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve({ data: result.data ?? null, error: result.error });
    },
  };
}

describe("pruneInviteCodeResets", () => {
  const original = console.warn;
  let warnings: unknown[][] = [];
  beforeEach(() => {
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
  });
  afterEach(() => {
    console.warn = original;
  });

  it("calls prune_invite_code_resets with no args and returns true", async () => {
    const client = fakeClient({ data: 3, error: null });
    assert.equal(await pruneInviteCodeResets(client), true);
    assert.deepEqual(client.calls, [["prune_invite_code_resets"]]);
    assert.equal(warnings.length, 0);
  });

  it("returns false with no admin client", async () => {
    assert.equal(await pruneInviteCodeResets(null), false);
    assert.deepEqual(warnings, [["[invite_code_resets] prune skipped: no admin client"]]);
  });

  it("returns false on an error", async () => {
    const client = fakeClient({ error: { code: "57014", message: "canceling statement" } });
    assert.equal(await pruneInviteCodeResets(client), false);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[invite_code_resets] prune failed:");
    assert.match(String(warnings[0][1]), /canceling statement/);
  });

  it("returns false and says the migration isn't applied when the RPC is missing", async () => {
    const client = fakeClient({
      error: { code: "PGRST202", message: "Could not find the function public.prune_invite_code_resets" },
    });
    assert.equal(await pruneInviteCodeResets(client), false);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[invite_code_resets] prune failed:");
    assert.match(warnings.map((w) => w.join(" ")).join(" "), /migration isn't applied/);
  });

  it("never throws, even if the client rejects", async () => {
    const client = fakeClient(new Error("network down"));
    assert.equal(await pruneInviteCodeResets(client), false);
    assert.match(String(warnings[0][1]), /network down/);
  });
});

describe("collection-snapshots cron", () => {
  it("prunes invite code resets after anon rate limits and returns the result", () => {
    const cron = readFileSync(join(process.cwd(), "app/api/cron/collection-snapshots/route.ts"), "utf8");
    assert.match(cron, /pruneAnonRateLimits\(\);\s*const inviteCodeResetsPruned = await pruneInviteCodeResets\(\);/);
    assert.match(cron, /^\s*inviteCodeResetsPruned,$/m);
  });
});
