import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("comp_flags insert lock migration", () => {
  it("removes authenticated insert and does not recreate the policy", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017120000_comp_flags_insert_lock.sql"),
      "utf8",
    );
    assert.match(sql, /drop policy if exists "Users insert own comp flags"/i);
    assert.match(sql, /revoke insert on public\.comp_flags from authenticated/i);
    assert.doesNotMatch(sql, /create policy "Users insert own comp flags"/i);
    assert.match(sql, /create table if not exists public\.anon_rate_limits/i);
  });
});
