import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptInvite, inviteOutcome } from "./accept";
import {
  INVITE_STORAGE_KEY,
  INVITE_TTL_MS,
  clearInvite,
  inviteHandle,
  readInvite,
  rememberInvite,
  type InviteStore,
} from "./attribution";
import { inviteCount } from "./count";

function memory(): InviteStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("invite attribution", () => {
  it("remembers the inviter's handle for 7 days, then forgets it", () => {
    const store = memory();
    const now = 1_000_000_000_000;
    assert.equal(rememberInvite("@Maya_C", store, now), true);
    assert.deepEqual(JSON.parse(store.data.get(INVITE_STORAGE_KEY) ?? ""), { username: "maya_c", savedAt: now });
    assert.equal(readInvite(store, now + 1000), "maya_c");
    assert.equal(readInvite(store, now + INVITE_TTL_MS + 1), null);
  });

  it("is cleared after use", () => {
    const store = memory();
    rememberInvite("maya", store);
    clearInvite(store);
    assert.equal(readInvite(store), null);
    assert.equal(store.data.has(INVITE_STORAGE_KEY), false);
  });

  it("stores a handle only, never an id or junk, and never a reserved name", () => {
    const store = memory();
    assert.equal(rememberInvite("6d31ab97-9162-4296-876d-9e0378872fce", store), false);
    assert.equal(rememberInvite("<script>", store), false);
    assert.equal(rememberInvite("admin", store), false);
    assert.equal(rememberInvite("slabhold", store), false);
    assert.equal(store.data.size, 0);
    assert.equal(inviteHandle("  Ada  "), "ada");
    assert.equal(inviteHandle("a"), null);
  });

  it("ignores tampered, future or broken values, and storage that throws", () => {
    const store = memory();
    store.data.set(INVITE_STORAGE_KEY, "{not json");
    assert.equal(readInvite(store), null);
    store.data.set(INVITE_STORAGE_KEY, JSON.stringify({ username: "maya", savedAt: Date.now() + 10 * 60_000 }));
    assert.equal(readInvite(store), null);
    store.data.set(INVITE_STORAGE_KEY, JSON.stringify({ username: "../admin", savedAt: Date.now() }));
    assert.equal(readInvite(store), null);
    const broken: InviteStore = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    assert.equal(readInvite(broken), null);
    assert.equal(rememberInvite("maya", broken), false);
    assert.doesNotThrow(() => clearInvite(broken));
  });
});

function rpcClient(result: { error: { code?: string; message: string } | null } | Error) {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      if (result instanceof Error) throw result;
      return { data: null, ...result };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("acceptInvite", () => {
  it("calls accept_invite with the handle", async () => {
    const { client, calls } = rpcClient({ error: null });
    assert.equal(await acceptInvite(client, "maya"), "accepted");
    assert.deepEqual(calls, [["accept_invite", { inviter_username: "maya" }]]);
  });

  it("says missing when the function isn't installed, or in local mode", async () => {
    assert.equal(await acceptInvite(rpcClient({ error: { code: "PGRST202", message: "x" } }).client, "maya"), "missing");
    assert.equal(
      await acceptInvite(rpcClient({ error: { message: "Could not find the function public.accept_invite" } }).client, "maya"),
      "missing",
    );
    assert.equal(await acceptInvite(null, "maya"), "missing");
  });

  it("never throws", async () => {
    assert.equal(await acceptInvite(rpcClient({ error: { code: "500", message: "boom" } }).client, "maya"), "failed");
    assert.equal(await acceptInvite(rpcClient(new Error("network")).client, "maya"), "failed");
  });
});

describe("inviteCount", () => {
  function countClient(result: { count: number | null; error: { message: string } | null }) {
    const seen: string[] = [];
    const chain = {
      select(_columns: string, options: unknown) {
        seen.push(`select ${JSON.stringify(options)}`);
        return chain;
      },
      eq(column: string, value: string) {
        seen.push(`eq ${column}=${value}`);
        return Promise.resolve(result);
      },
    };
    const client = {
      from(table: string) {
        seen.push(`from ${table}`);
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, seen };
  }

  it("counts the user's own invites rows", async () => {
    const { client, seen } = countClient({ count: 3, error: null });
    assert.equal(await inviteCount(client, "u1"), 3);
    assert.deepEqual(seen, ['from invites', 'select {"count":"exact","head":true}', "eq inviter_id=u1"]);
  });

  it("is null when it can't be read, like before the migration", async () => {
    assert.equal(await inviteCount(countClient({ count: null, error: { message: "relation does not exist" } }).client, "u1"), null);
    assert.equal(await inviteCount(null, "u1"), null);
    assert.equal(await inviteCount(countClient({ count: 0, error: null }).client, ""), null);
  });
});

describe("inviteOutcome", () => {
  it("confirms the follow-back, offers Follow without the RPC, and stays quiet otherwise", () => {
    assert.equal(inviteOutcome("accepted", true), "following");
    assert.equal(inviteOutcome("accepted", false), "none", "skipped by the RPC: a block or an earlier invite");
    assert.equal(inviteOutcome("missing", false), "prompt");
    assert.equal(inviteOutcome("missing", true), "none", "already following: nothing to ask");
    assert.equal(inviteOutcome("failed", false), "none");
  });
});
