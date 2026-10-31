import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const schema = read("supabase/schema.sql");

/** The body of `create table if not exists public.profiles (...)`. */
function profilesTable(sql: string) {
  const start = sql.indexOf("create table if not exists public.profiles (");
  assert.ok(start > -1, "profiles table");
  return sql.slice(start, sql.indexOf("\n);", start));
}

/** The columns in the main profiles column grant in schema.sql. */
function grantedColumns(sql: string) {
  const match = sql.match(/grant select \(([^)]*)\) on public\.profiles to anon, authenticated;/);
  assert.ok(match, "profiles column grant");
  return match[1].split(",").map((column) => column.trim());
}

describe("schema.sql has the profiles columns the migrations add", () => {
  it("adds show_as_hunter, show_badges and pinned_badges as the migrations do", () => {
    const table = profilesTable(schema);
    // 20261020220000_card_hunters.sql
    assert.match(table, /\n  show_as_hunter boolean not null default false,/);
    // 20261028200000_achievements_badges.sql
    assert.match(table, /\n  show_badges boolean not null default true,/);
    assert.match(table, /\n  pinned_badges text\[\] not null default '\{\}',/);
    assert.match(
      table,
      /\n  constraint profiles_pinned_badges_max check \(cardinality\(pinned_badges\) <= 3\)/,
    );
  });

  it("grants SELECT on show_badges and show_as_hunter in the existing column list", () => {
    const columns = grantedColumns(schema);
    assert.ok(columns.includes("show_badges"));
    assert.ok(columns.includes("show_as_hunter"));
  });

  it("never grants pinned_badges, or profiles table-wide, to anon or authenticated", () => {
    assert.ok(!grantedColumns(schema).includes("pinned_badges"));
    for (const match of schema.matchAll(/grant select \(([^)]*)\) on public\.profiles to [^;]*;/g)) {
      assert.doesNotMatch(match[1], /pinned_badges/, match[0]);
    }
    assert.doesNotMatch(schema, /grant select on (table )?public\.profiles to/i);
    assert.doesNotMatch(schema, /grant all[^;]* on (table )?public\.profiles to/i);
  });
});
