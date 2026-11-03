import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remoteSendMessage } from "../social/dm-actions";
import { remoteAddComment, remoteCreatePost, remoteUpdatePost, remoteUpdateProfile } from "../social/remote";
import { CONTENT_PROBLEM } from "./content-filter";

/**
 * docs/appstore-blockers-1/proposed-safety-guards.sql raises these from a
 * BEFORE trigger. Text that passes the client filter but trips the database
 * one (or a write from a suspended session) must read as the trigger wrote it.
 */
const FILTERED = { code: "23514", message: CONTENT_PROBLEM };
const SUSPENDED = { code: "42501", message: "Your account is suspended" };

/** Reads come back empty; any insert, update or upsert fails with `failure`. */
function triggerClient(failure: { code: string; message: string }) {
  const writes: string[] = [];
  const from = (table: string) => {
    let wrote = false;
    const result = () => (wrote ? { data: null, error: failure } : { data: null, error: null });
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "in", "or", "order", "limit", "ilike", "neq", "gte", "lte"]) {
      query[name] = () => query;
    }
    for (const name of ["insert", "update", "upsert"]) {
      query[name] = () => {
        wrote = true;
        writes.push(`${name}:${table}`);
        return query;
      };
    }
    query.single = async () => result();
    query.maybeSingle = async () => result();
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  };
  const supabase = {
    from,
    // can_interact: the two people may interact.
    rpc: async () => ({ data: true, error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  } as unknown as SupabaseClient;
  return { supabase, writes };
}

const TEXT = "Clean pickup from the card show";

describe("database trigger errors read as written", () => {
  for (const failure of [FILTERED, SUSPENDED]) {
    describe(failure.code, () => {
      it("remoteCreatePost", async () => {
        const { supabase, writes } = triggerClient(failure);
        const result = await remoteCreatePost(supabase, "user-1", { body: TEXT, imageDataUrl: null, card: null });
        assert.ok(writes.includes("insert:posts"));
        assert.equal(result.error, failure.message);
      });

      it("remoteUpdatePost", async () => {
        const { supabase, writes } = triggerClient(failure);
        const result = await remoteUpdatePost(supabase, "user-1", "post-1", { body: TEXT, imageDataUrl: null });
        assert.ok(writes.includes("update:posts"));
        assert.equal(result.error, failure.message);
      });

      it("remoteAddComment", async () => {
        const { supabase, writes } = triggerClient(failure);
        const result = await remoteAddComment(supabase, "user-1", "post-1", TEXT, null);
        assert.ok(writes.includes("insert:comments"));
        assert.equal(result.error, failure.message);
      });

      it("remoteSendMessage", async () => {
        const { supabase, writes } = triggerClient(failure);
        const result = await remoteSendMessage(supabase, "user-1", "user-2", TEXT);
        assert.ok(writes.includes("insert:messages"));
        assert.equal(result.error, failure.message);
      });

      it("remoteUpdateProfile", async () => {
        const { supabase, writes } = triggerClient(failure);
        const result = await remoteUpdateProfile(supabase, "user-1", {
          username: "wax_room",
          displayName: "Ada",
          bio: TEXT,
          avatarDataUrl: null,
          coverDataUrl: null,
        });
        assert.ok(writes.includes("update:profiles"));
        assert.equal(result.error, failure.message);
      });
    });
  }
});
