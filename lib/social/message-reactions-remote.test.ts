import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadReactions,
  mergeLoaded,
  reactionEventMessageId,
  saveReaction,
} from "./message-reactions-remote";
import type { MessageReaction } from "./message-reactions";

type Call = { table: string; op: string; args: unknown[] };

/** A tiny stand-in for supabase-js: records each call and answers with `result`. */
function fakeClient(result: (call: Call[]) => { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: Call[][] = [];
  const client = {
    from(table: string) {
      const chain: Call[] = [];
      calls.push(chain);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "in", "eq", "upsert", "delete"]) {
        builder[op] = (...args: unknown[]) => {
          chain.push({ table, op, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null, ...result(chain) });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const row = (message: string, user: string, emoji: string) => ({
  message_id: message,
  user_id: user,
  emoji,
  created_at: "2026-11-16T10:00:00.000Z",
});

describe("message reactions remote", () => {
  it("reads reactions for the thread's messages, in chunks, skipping bad rows", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `m${index}`);
    const { client, calls } = fakeClient((chain) => {
      const inCall = chain.find((call) => call.op === "in");
      const chunk = (inCall?.args[1] as string[]) ?? [];
      return { data: chunk.includes("m0") ? [row("m0", "ada", "❤️"), row("m0", "me", "💩")] : [row("m120", "me", "🔥")] };
    });
    const result = await loadReactions(client, ids);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.[0]?.table, "message_reactions");
    assert.deepEqual(
      result.rows.map((item) => `${item.messageId}:${item.userId}:${item.emoji}`),
      ["m0:ada:❤️", "m120:me:🔥"],
    );
    assert.equal(result.missing, false);
  });

  it("says when the table isn't there yet, so the thread hides reactions", async () => {
    const { client } = fakeClient(() => ({ error: { code: "PGRST205", message: "Could not find the table" } }));
    const result = await loadReactions(client, ["m1"]);
    assert.deepEqual(result, { rows: [], missing: true });
  });

  it("upserts a pick and deletes a removal, always as the viewer", async () => {
    const set = fakeClient(() => ({}));
    assert.deepEqual(await saveReaction(set.client, { messageId: "m1", userId: "me", emoji: "🔥" }), {});
    const upsert = set.calls[0]?.find((call) => call.op === "upsert");
    assert.deepEqual(upsert?.args, [{ message_id: "m1", user_id: "me", emoji: "🔥" }, { onConflict: "message_id,user_id" }]);

    const clear = fakeClient(() => ({}));
    await saveReaction(clear.client, { messageId: "m1", userId: "me", emoji: null });
    assert.deepEqual(
      clear.calls[0]?.map((call) => `${call.op}:${call.args.join(",")}`),
      ["delete:", "eq:message_id,m1", "eq:user_id,me"],
    );

    const failed = fakeClient(() => ({ error: { message: "new row violates row-level security policy" } }));
    assert.deepEqual(await saveReaction(failed.client, { messageId: "m1", userId: "me", emoji: "❤️" }), {
      error: "Couldn't react to that message.",
    });
  });

  it("only reloads for a live event about a message on screen", () => {
    const ids = new Set(["m1"]);
    assert.equal(reactionEventMessageId({ new: { message_id: "m1" } }), "m1");
    // A delete names only the key columns, message_id included.
    assert.equal(reactionEventMessageId({ old: { message_id: "m1", user_id: "ada" } }), "m1");
    assert.equal(reactionEventMessageId({ new: {} , old: {} }), null);
    assert.equal(ids.has(reactionEventMessageId({ new: { message_id: "m9" } }) ?? ""), false);
  });

  it("replaces only the messages it read, and leaves ones mid-save alone", () => {
    const prev: MessageReaction[] = [
      { messageId: "m1", userId: "ada", emoji: "❤️", createdAt: "a" },
      { messageId: "m2", userId: "me", emoji: "👍", createdAt: "a" },
      { messageId: "m3", userId: "me", emoji: "😂", createdAt: "a" },
    ];
    const next = mergeLoaded(prev, [{ messageId: "m2", userId: "ada", emoji: "🔥", createdAt: "b" }], {
      read: new Set(["m1", "m2", "m3"]),
      saving: new Set(["m3"]),
    });
    assert.deepEqual(
      next.map((item) => `${item.messageId}:${item.userId}:${item.emoji}`).sort(),
      ["m2:ada:🔥", "m3:me:😂"],
    );
  });
});
