import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readVisiblePins } from "./visible-pins";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(results: Record<string, Result>) {
  const reads: { table: string; columns: string; id: string }[] = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(_column: string, id: string) {
              return {
                maybeSingle: async () => {
                  reads.push({ table, columns, id });
                  return results[table] ?? { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, reads };
}

describe("visible pins", () => {
  it("reads pins from the profile_badge_pins view", async () => {
    const { client, reads } = fakeClient({
      profile_badge_pins: { data: { pinned_badges: ["collector:gold", 7] }, error: null },
    });
    assert.deepEqual(await readVisiblePins(client, "u1"), ["collector:gold"]);
    assert.deepEqual(reads, [{ table: "profile_badge_pins", columns: "pinned_badges", id: "u1" }]);
  });

  it("falls back to the profiles column only while the view is missing", async () => {
    const { client, reads } = fakeClient({
      profile_badge_pins: { data: null, error: { code: "PGRST205", message: "Could not find the table" } },
      profiles: { data: { pinned_badges: ["streak:bronze"] }, error: null },
    });
    assert.deepEqual(await readVisiblePins(client, "u1"), ["streak:bronze"]);
    assert.deepEqual(reads.map((read) => read.table), ["profile_badge_pins", "profiles"]);
  });

  it("shows no pins on any other error", async () => {
    const { client, reads } = fakeClient({
      profile_badge_pins: { data: null, error: { code: "57014", message: "timeout" } },
      profiles: { data: { pinned_badges: ["streak:bronze"] }, error: null },
    });
    assert.deepEqual(await readVisiblePins(client, "u1"), []);
    assert.equal(reads.length, 1);
  });

  it("is how profile pages and profile share images read pins", () => {
    for (const path of ["lib/badges/load.ts", "lib/social/link-preview-load.ts"]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      assert.match(source, /readVisiblePins\(/, path);
      // The service-role admin read in load.ts is the only one left.
      assert.doesNotMatch(
        source,
        /supabase\s*\.from\("profiles"\)\s*\.select\("[^"]*pinned_badges/,
        `${path} reads pinned_badges from profiles as the viewer`,
      );
    }
  });
});
