import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("posts quote insert RLS migration", () => {
  it("recreates insert/update policies as auth.uid() = user_id only", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261016290000_fix_posts_quote_insert_rls.sql",
      ),
      "utf8",
    );
    assert.match(sql, /drop policy if exists "Create own posts"/i);
    assert.match(sql, /drop policy if exists "Update own posts"/i);
    assert.match(
      sql,
      /create policy "Create own posts"[\s\S]*for insert with check \(auth\.uid\(\) = user_id\)/i,
    );
    assert.match(
      sql,
      /create policy "Update own posts"[\s\S]*with check \(auth\.uid\(\) = user_id\)/i,
    );
    assert.doesNotMatch(sql, /exists\s*\(/i);
  });
});
