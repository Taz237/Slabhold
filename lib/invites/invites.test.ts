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
import { fetchInviteCode, inviteCode, resetInviteCode } from "./code";
import { inviteCount } from "./count";

const CODE = "0123456789abcdef0123456789abcdef";

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
  it("remembers the inviter's handle and code for 7 days, then forgets it", () => {
    const store = memory();
    const now = 1_000_000_000_000;
    assert.equal(rememberInvite("@Maya_C", CODE, store, now), true);
    assert.deepEqual(JSON.parse(store.data.get(INVITE_STORAGE_KEY) ?? ""), { username: "maya_c", code: CODE, savedAt: now });
    assert.deepEqual(readInvite(store, now + 1000), { username: "maya_c", code: CODE });
    assert.equal(readInvite(store, now + INVITE_TTL_MS + 1), null);
  });

  it("keeps a link without a code, or with a bad one, as handle only", () => {
    const store = memory();
    rememberInvite("maya", null, store);
    assert.deepEqual(readInvite(store), { username: "maya", code: null });
    rememberInvite("maya", "not-a-code", store);
    assert.deepEqual(readInvite(store), { username: "maya", code: null });
    // An invite saved before codes existed still reads.
    store.data.set(INVITE_STORAGE_KEY, JSON.stringify({ username: "maya", savedAt: Date.now() }));
    assert.deepEqual(readInvite(store), { username: "maya", code: null });
    store.data.set(INVITE_STORAGE_KEY, JSON.stringify({ username: "maya", code: "<x>", savedAt: Date.now() }));
    assert.deepEqual(readInvite(store), { username: "maya", code: null });
  });

  it("is cleared after use", () => {
    const store = memory();
    rememberInvite("maya", CODE, store);
    clearInvite(store);
    assert.equal(readInvite(store), null);
    assert.equal(store.data.has(INVITE_STORAGE_KEY), false);
  });

  it("stores a handle only, never an id or junk, and never a reserved name", () => {
    const store = memory();
    assert.equal(rememberInvite("6d31ab97-9162-4296-876d-9e0378872fce", CODE, store), false);
    assert.equal(rememberInvite("<script>", CODE, store), false);
    assert.equal(rememberInvite("admin", CODE, store), false);
    assert.equal(rememberInvite("slabhold", CODE, store), false);
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
    assert.equal(rememberInvite("maya", CODE, broken), false);
    assert.doesNotThrow(() => clearInvite(broken));
  });
});

function rpcClient(result: { data?: unknown; error: { code?: string; message: string } | null } | Error) {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args?: unknown) {
      calls.push(args === undefined ? [name] : [name, args]);
      if (result instanceof Error) throw result;
      return { data: null, ...result };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("acceptInvite", () => {
  it("calls accept_invite with the handle and code, and reports what it did", async () => {
    const { client, calls } = rpcClient({ data: "mutual", error: null });
    assert.equal(await acceptInvite(client, "maya", CODE), "mutual");
    assert.deepEqual(calls, [["accept_invite", { inviter_username: "maya", code: CODE }]]);
    const plain = rpcClient({ data: "following", error: null });
    assert.equal(await acceptInvite(plain.client, "maya", null), "following");
    assert.deepEqual(plain.calls, [["accept_invite", { inviter_username: "maya", code: null }]]);
    assert.equal(await acceptInvite(rpcClient({ data: null, error: null }).client, "maya", CODE), "skipped");
    assert.equal(await acceptInvite(rpcClient({ data: "anything", error: null }).client, "maya", CODE), "skipped");
  });

  it("says missing when the function isn't installed, or in local mode", async () => {
    assert.equal(await acceptInvite(rpcClient({ error: { code: "PGRST202", message: "x" } }).client, "maya", CODE), "missing");
    assert.equal(
      await acceptInvite(rpcClient({ error: { message: "Could not find the function public.accept_invite" } }).client, "maya", CODE),
      "missing",
    );
    assert.equal(await acceptInvite(null, "maya", CODE), "missing");
  });

  it("never throws", async () => {
    assert.equal(await acceptInvite(rpcClient({ error: { code: "500", message: "boom" } }).client, "maya", CODE), "failed");
    assert.equal(await acceptInvite(rpcClient(new Error("network")).client, "maya", CODE), "failed");
  });
});

describe("invite codes", () => {
  it("accepts only 32 lowercase hex characters", () => {
    assert.equal(inviteCode(CODE), CODE);
    assert.equal(inviteCode(` ${CODE.toUpperCase()} `), CODE);
    assert.equal(inviteCode("abc"), null);
    assert.equal(inviteCode(`${CODE}0`), null);
    assert.equal(inviteCode("g123456789abcdef0123456789abcdef"), null);
    assert.equal(inviteCode(["x"]), null);
    assert.equal(inviteCode(undefined), null);
  });

  it("reads your own code from my_invite_code, and is null on any miss", async () => {
    const { client, calls } = rpcClient({ data: CODE, error: null });
    assert.equal(await fetchInviteCode(client), CODE);
    assert.deepEqual(calls, [["my_invite_code"]]);
    assert.equal(await fetchInviteCode(rpcClient({ data: null, error: null }).client), null);
    assert.equal(await fetchInviteCode(rpcClient({ data: "junk", error: null }).client), null);
    assert.equal(await fetchInviteCode(rpcClient({ error: { code: "PGRST202", message: "x" } }).client), null);
    assert.equal(await fetchInviteCode(rpcClient(new Error("network")).client), null);
    assert.equal(await fetchInviteCode(null), null);
  });

  it("gets a new code from reset_invite_code, and says when the daily limit is hit", async () => {
    const NEW = "fedcba9876543210fedcba9876543210";
    const { client, calls } = rpcClient({ data: NEW, error: null });
    assert.deepEqual(await resetInviteCode(client), { kind: "ok", code: NEW });
    assert.deepEqual(calls, [["reset_invite_code"]]);
    assert.deepEqual(
      await resetInviteCode(rpcClient({ error: { code: "P0001", message: "invite_reset_limit" } }).client),
      { kind: "limit" },
    );
    assert.deepEqual(await resetInviteCode(rpcClient({ error: { code: "PGRST202", message: "x" } }).client), { kind: "missing" });
    assert.deepEqual(await resetInviteCode(rpcClient({ data: null, error: null }).client), { kind: "failed" });
    assert.deepEqual(await resetInviteCode(rpcClient({ data: "junk", error: null }).client), { kind: "failed" });
    assert.deepEqual(await resetInviteCode(rpcClient(new Error("network")).client), { kind: "failed" });
    assert.deepEqual(await resetInviteCode(null), { kind: "missing" });
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
  it("confirms the follow-back only when there was one, offers Follow without the RPC, and stays quiet otherwise", () => {
    assert.equal(inviteOutcome("mutual", true), "mutual");
    assert.equal(inviteOutcome("following", true), "following", "no code: you follow them, no follow-back");
    assert.equal(inviteOutcome("mutual", false), "none");
    assert.equal(inviteOutcome("following", false), "none");
    assert.equal(inviteOutcome("skipped", false), "none", "skipped by the RPC: a block or an earlier invite");
    assert.equal(inviteOutcome("skipped", true), "none");
    assert.equal(inviteOutcome("missing", false), "prompt");
    assert.equal(inviteOutcome("missing", true), "none", "already following: nothing to ask");
    assert.equal(inviteOutcome("failed", false), "none");
  });
});
