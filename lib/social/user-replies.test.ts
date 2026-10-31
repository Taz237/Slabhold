import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USER_REPLIES_LIMIT, loadUserReplies } from "./user-replies";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const MUTED = "33333333-3333-4333-8333-333333333333";

describe("a profile's replies", () => {
  it("reads that person's newest replies only, with the mute filter", async () => {
    const ops: string[] = [];
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, key) {
          if (key === "then") {
            return (resolve: (value: unknown) => unknown) =>
              Promise.resolve({
                data: [{ id: "c1", post_id: "p1", user_id: AUTHOR, body: "nice", created_at: "2026-10-30T00:00:00.000Z" }],
                error: null,
              }).then(resolve);
          }
          return (...args: unknown[]) => {
            ops.push(`${String(key)}:${args.map((arg) => (Array.isArray(arg) ? arg.join(",") : typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(":")}`);
            return builder;
          };
        },
      },
    );
    const supabase = { from: () => builder } as unknown as SupabaseClient;
    const replies = await loadUserReplies(supabase, { userId: AUTHOR, viewerId: VIEWER, mutedHidden: [MUTED] });
    assert.deepEqual(replies.map((reply) => [reply.id, reply.postId, reply.body]), [["c1", "p1", "nice"]]);
    const joined = ops.join("|");
    assert.match(joined, new RegExp(`eq:user_id:${AUTHOR}`));
    assert.match(joined, new RegExp(`limit:${USER_REPLIES_LIMIT}`));
    assert.match(joined, new RegExp(MUTED));
  });
});
