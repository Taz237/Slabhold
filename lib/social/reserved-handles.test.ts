import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RESERVED_USERNAMES } from "./local-db";
import { OFFICIAL_UPDATES_USER_ID, isOfficialUpdatesAccount } from "./official-updates";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20261022223000_reserve_profile_usernames.sql",
);

describe("reserved profile handles migration", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const helper = sql.slice(
    sql.indexOf("function private.available_profile_username"),
    sql.indexOf("function private.enforce_reserved_username"),
  );
  const signup = sql.slice(sql.indexOf("function public.handle_new_user"));

  it("is unapplied and stays in sync with the app uuid and reserved list", () => {
    assert.match(sql, /Not applied/i);
    assert.match(sql, /\nbegin;\n/);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /\ncommit;\n?$/);
    assert.match(sql, /set search_path = ''/);
    assert.doesNotMatch(sql, /set search_path = public/);
    assert.match(sql, new RegExp(OFFICIAL_UPDATES_USER_ID));
    assert.match(sql, /must stay in sync with OFFICIAL_UPDATES_USER_ID/);
    assert.match(sql, /must stay in sync with RESERVED_USERNAMES/);
    assert.deepEqual(RESERVED_USERNAMES, ["grokbotreview", "slabholdupdates"]);
    for (const handle of RESERVED_USERNAMES) {
      assert.match(helper, new RegExp(`'${handle}'`));
    }
  });

  it("rewrites a reserved handle in signup and on profile username writes", () => {
    assert.match(sql, /private\.available_profile_username\(new\.id, handle\)/);
    assert.match(sql, /before insert or update of username on public\.profiles/);
    assert.match(sql, /execute function private\.enforce_reserved_username\(\)/);
    assert.match(helper, /left\('user_' \|\| substr\(md5/);
    assert.match(helper, /from public\.profiles/);
    assert.match(helper, /if profile_id = official_id then/);
    assert.match(sql, /if tg_op = 'UPDATE'/);
    assert.match(sql, /new\.username := old\.username/);
    assert.match(signup, /on conflict \(id\) do nothing/);
    assert.doesNotMatch(helper, /raise exception/);
    assert.match(signup, /raise exception 'invalid username'/);
  });

  it("recognizes only the official updates uuid", () => {
    assert.equal(isOfficialUpdatesAccount(OFFICIAL_UPDATES_USER_ID), true);
    assert.equal(isOfficialUpdatesAccount(OFFICIAL_UPDATES_USER_ID.toUpperCase()), true);
    assert.equal(isOfficialUpdatesAccount("slabholdupdates"), false);
    assert.equal(isOfficialUpdatesAccount("grokbotreview"), false);
    assert.equal(isOfficialUpdatesAccount(null), false);
  });
});
