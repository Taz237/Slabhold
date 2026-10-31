import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const MIGRATION = "supabase/migrations/20261023011000_leaderboard_opt_in.sql";
/** Any table-wide SELECT grant on profiles: it would reopen every column, pinned_badges included. */
const TABLE_WIDE = /grant select on (table )?public\.profiles to/i;

/** The header as one line of prose: comment markers and line wraps removed. */
function header(sql: string) {
  return sql.slice(0, sql.indexOf("\nbegin;")).replace(/\n--\s*/g, " ").replace(/\s+/g, " ");
}

describe("leaderboard_opt_in is readable column by column, never table-wide", () => {
  it("the migration grants SELECT on the new column only", () => {
    const sql = read(MIGRATION);
    assert.match(sql, /^-- UNAPPLIED\. Needs review before running\.\n/);
    assert.match(sql, /grant select \(leaderboard_opt_in\) on public\.profiles to anon, authenticated;/);
    assert.doesNotMatch(sql, TABLE_WIDE);
    // The grant comes after the column exists, inside the transaction.
    const body = sql.slice(sql.indexOf("\nbegin;"));
    const add = body.indexOf("add column if not exists leaderboard_opt_in");
    const grant = body.indexOf("grant select (leaderboard_opt_in)");
    assert.ok(add > -1 && grant > add && grant < body.lastIndexOf("commit;"));
  });

  it("the migration's header matches what its SQL does", () => {
    const top = header(read(MIGRATION));
    // Old claims that no longer hold.
    assert.doesNotMatch(top, /profiles SELECT is public/);
    assert.doesNotMatch(top, /only public read of card snapshots/);
    // What the file does, named in the header.
    for (const thing of [
      /grant select \(leaderboard_opt_in\)/,
      /protect_profile_created_at/,
      /card_value_snapshots/,
      /card_value_snapshot_defaults/,
      /card_value_snapshot_keep_identity/,
      /card_snapshot_identity/,
      /leaderboard_rows\(\)[^.]*service role only/,
      /leaderboard_hidden_ids/,
      /blocked_by_ids/,
    ]) {
      assert.match(top, thing, String(thing));
    }
  });

  it("schema.sql grants profiles SELECT column by column, as on prod", () => {
    const schema = read("supabase/schema.sql");
    assert.doesNotMatch(schema, TABLE_WIDE);
    assert.match(schema, /revoke select on public\.profiles from public, anon, authenticated;/);
    assert.match(
      schema,
      /grant select \(id, username, display_name, bio, avatar_url, cover_url, accent, created_at\) on public\.profiles to anon, authenticated;/,
    );
    // Every column added later is granted right after it is added.
    for (const column of ["pinned_post_id", "is_test", "leaderboard_opt_in"]) {
      const add = schema.indexOf(`add column if not exists ${column}`);
      const grant = schema.indexOf(`grant select (${column}) on public.profiles to anon, authenticated;`);
      assert.ok(add > -1 && grant > add, column);
    }
    assert.doesNotMatch(schema, /profiles SELECT is public/);
  });
});
