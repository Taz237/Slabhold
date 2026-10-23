import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadServerSuggestions } from "./load-suggestions";
import { OFFICIAL_UPDATES_USER_ID } from "./official-updates";

function rpcClient(rows: object[]) {
  return {
    async rpc() {
      return { data: rows, error: null };
    },
  } as unknown as SupabaseClient;
}

describe("loadServerSuggestions", () => {
  it("never suggests @slabholdupdates from the suggest_collectors RPC", async () => {
    const source = readFileSync(join(process.cwd(), "lib/social/load-suggestions.ts"), "utf8");
    assert.match(source, /officialUpdatesUserId\(/);
    assert.doesNotMatch(source, /slabholdupdates|grokbotreview/);

    const rows = await loadServerSuggestions(
      rpcClient([
        {
          user_id: OFFICIAL_UPDATES_USER_ID.toUpperCase(),
          username: "slabholdupdates",
          display_name: "Slabhold Updates",
          avatar_url: null,
          accent: null,
          reason: "Posts about the Chiefs",
          score: 70,
        },
        {
          user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          username: "ada",
          display_name: "Ada",
          avatar_url: null,
          accent: null,
          reason: "Collects Wembanyama",
          score: 80,
        },
      ]),
    );
    assert.deepEqual(
      rows?.map((row) => row.username),
      ["ada"],
    );
    assert.equal(rows?.some((row) => row.userId.toLowerCase() === OFFICIAL_UPDATES_USER_ID), false);
  });

  it("strips packed sport marks from the suggestion reason", async () => {
    const rows = await loadServerSuggestions(
      rpcClient([
        {
          user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          username: "ada",
          display_name: "Ada",
          reason: "Collects Smith\u2060\u200b\u200c\u200d\u2062\u2063",
          score: 80,
        },
        {
          user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          username: "bea",
          display_name: "Bea",
          reason: "\u2060\u200b",
          score: 10,
        },
      ]),
    );
    assert.equal(rows?.[0]?.reason, "Collects Smith");
    assert.equal(rows?.[1]?.reason, null);
  });
});
