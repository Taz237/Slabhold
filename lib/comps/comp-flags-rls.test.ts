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

describe("comp_flags delete lock migration", () => {
  it("drops the owner delete policy so a direct client delete is denied", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261019230000_comp_flags_delete_lock.sql"),
      "utf8",
    );
    assert.match(sql, /drop policy if exists "Users delete own comp flags"/i);
    assert.match(sql, /revoke delete on public\.comp_flags from authenticated/i);
    assert.match(sql, /revoke delete on public\.comp_flags from anon/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /grant delete/i);
  });
});
