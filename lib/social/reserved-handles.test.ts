import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RESERVED_USERNAMES, isReservedUsername, isUpdatesHandleVariant } from "./local-db";
import { OFFICIAL_UPDATES_USER_ID, isOfficialUpdatesAccount } from "./official-updates";
import { TAKEN_USERNAME, usernameTakenMessage } from "./username-taken";

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
  const enforce = sql.slice(
    sql.indexOf("function private.enforce_reserved_username"),
    sql.indexOf("function public.handle_new_user"),
  );
  const signup = sql.slice(
    sql.indexOf("function public.handle_new_user"),
    sql.indexOf("drop trigger if exists profiles_reserve_username"),
  );
  const suggest = sql.slice(sql.indexOf("function private.suggest_collectors"));

  it("keeps the SQL reserved list identical to RESERVED_USERNAMES", () => {
    assert.match(sql, /Not applied/i);
    assert.match(sql, /\nbegin;\n/);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /\ncommit;\n?$/);
    assert.match(helper, /set search_path = ''/);
    assert.doesNotMatch(helper, /set search_path = public/);
    assert.match(sql, new RegExp(OFFICIAL_UPDATES_USER_ID));
    assert.match(sql, /must stay in sync with OFFICIAL_UPDATES_USER_ID/);
    assert.match(sql, /must stay in sync with RESERVED_USERNAMES/);
    const listed = helper.match(/reserved text\[\] := array\[([\s\S]*?)\];/);
    assert.ok(listed);
    const sqlHandles = [...listed[1].matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]);
    assert.deepEqual(sqlHandles, [...RESERVED_USERNAMES]);
    assert.deepEqual(sqlHandles, [
      "grokbotreview",
      "slabholdupdates",
      "slabhold",
      "slabholdapp",
      "slabhold_updates",
      "slabholdteam",
      "slabholdsupport",
      "slabholdofficial",
      "admin",
      "administrator",
      "support",
      "help",
      "moderator",
      "mod",
      "official",
      "staff",
      "team",
    ]);
  });

  it("rewrites reserved names on signup and rejects a reserved rename", () => {
    assert.match(sql, /private\.available_profile_username\(new\.id, handle\)/);
    assert.match(sql, /before insert or update of username on public\.profiles/);
    assert.match(sql, /execute function private\.enforce_reserved_username\(\)/);
    assert.match(
      enforce,
      /if tg_op = 'UPDATE' and new\.username is not distinct from old\.username then\s+return new;/,
    );
    assert.match(enforce, /errcode = '23505'/);
    assert.doesNotMatch(enforce, /new\.username := old\.username/);
    assert.doesNotMatch(signup, /23505/);
    assert.match(helper, /left\('user_' \|\| substr\(md5/);
    assert.match(helper, /from public\.profiles/);
    assert.match(helper, /stem in \('grokbotreview', 'slabholdupdates'\)/);
    assert.match(helper, /regexp_replace\(normalized, '\[_\.-\]', '', 'g'\)/);
    assert.match(helper, /'\[0-9\]\+\$'/);
    assert.match(signup, /on conflict \(id\) do nothing/);
    assert.doesNotMatch(helper, /raise exception/);
    assert.match(signup, /raise exception 'invalid username'/);
    const revokeAt = sql.indexOf(
      "revoke all on function private.available_profile_username(pg_catalog.uuid, text) from public, anon, authenticated;",
    );
    const grantAt = sql.indexOf(
      "grant execute on function private.available_profile_username(pg_catalog.uuid, text) to authenticated, service_role;",
    );
    assert.ok(revokeAt > 0 && grantAt > revokeAt);
  });

  it("maps the rename failure to the taken message and excludes the updates uuid from suggestions", () => {
    assert.equal(usernameTakenMessage({ code: "23505", message: "username taken" }), TAKEN_USERNAME);
    assert.match(suggest, /p\.id <> '6d31ab97-9162-4296-876d-9e0378872fce'/);
    assert.doesNotMatch(suggest, /p\.username <> 'grokbotreview'/);
    assert.match(suggest, /p\.username = 'slabhold'/);
    assert.match(suggest, /security definer/);
    assert.match(suggest, /set search_path = public/);
    assert.match(suggest, /left\(p\.username, 3\) <> 'qa_'/);
  });

  it("reserves lookalikes and lets only the official uuid take updates variants", () => {
    assert.equal(isReservedUsername("slabholdupdates1"), true);
    assert.equal(isReservedUsername("grokbotreview_"), true);
    assert.equal(isReservedUsername("slabhold.updates"), true);
    assert.equal(isReservedUsername("slabhold-updates"), true);
    assert.equal(isUpdatesHandleVariant("admin"), false);
    assert.equal(isReservedUsername("admin"), true);
    assert.equal(isReservedUsername("slabhold2updates"), false);
    assert.equal(isOfficialUpdatesAccount(OFFICIAL_UPDATES_USER_ID), true);
    assert.equal(isOfficialUpdatesAccount("slabholdupdates"), false);
    assert.equal(isOfficialUpdatesAccount("grokbotreview"), false);
    assert.equal(isOfficialUpdatesAccount(null), false);
  });
});
