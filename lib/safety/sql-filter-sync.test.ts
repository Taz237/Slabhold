import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BLOCKED_ENTRIES, CONTENT_PROBLEM } from "./content-filter";
import { REPORT_DAILY_LIMIT, REPORT_LIMIT_MESSAGE } from "./report";

const SQL_PATH = "docs/appstore-blockers-1/proposed-safety-guards.sql";
const sql = readFileSync(join(process.cwd(), SQL_PATH), "utf8");

function sqlArray(name: string): string[] {
  const match = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\];`).exec(sql);
  assert.ok(match, `${name} array`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((item) => item[1]);
}

/** SQL string literal for a JS string. */
function quoted(text: string) {
  return `'${text.replace(/'/g, "''")}'`;
}

describe("proposed safety guards SQL", () => {
  it("starts with the PROPOSED header", () => {
    assert.ok(
      sql.startsWith(
        "-- PROPOSED, NOT APPLIED. For QA Guard review. Do not run. Nobody runs db push or the Supabase CLI.\n",
      ),
    );
  });

  it("is not a migration", () => {
    assert.ok(!SQL_PATH.startsWith("supabase/"));
    const migrations = join(process.cwd(), "supabase/migrations");
    assert.ok(!existsSync(join(migrations, "proposed-safety-guards.sql")));
    for (const file of readdirSync(migrations)) {
      const text = readFileSync(join(migrations, file), "utf8");
      assert.doesNotMatch(text, /blocked_text|guard_user_text|cap_reports/, file);
    }
  });

  it("has the same word list as BLOCKED", () => {
    const plain = BLOCKED_ENTRIES.filter((entry): entry is string => typeof entry === "string");
    const words = BLOCKED_ENTRIES.filter((entry): entry is { word: string } => typeof entry !== "string").map(
      (entry) => entry.word,
    );
    assert.deepEqual(sqlArray("plain_words"), plain.filter((entry) => !entry.includes(" ")));
    assert.deepEqual(sqlArray("phrases"), plain.filter((entry) => entry.includes(" ")));
    assert.deepEqual(sqlArray("whole_words"), words);
  });

  it("maps the same lookalikes and leetspeak as the TS filter", () => {
    const source = readFileSync(join(process.cwd(), "lib/safety/content-filter.ts"), "utf8");
    const pairs = [/const LOOKALIKE = "([^"]+)"/, /const LEET = "([^"]+)"/].map((pattern) => {
      const match = pattern.exec(source);
      assert.ok(match);
      return match[1];
    });
    const translate = /translate\(\s*lower\([\s\S]*?\),\s*'([^']+)',\s*'([^']+)'\s*\)/.exec(sql);
    assert.ok(translate, "translate() call");
    const [, from, to] = translate;
    assert.equal([...from].length, [...to].length);
    const fromChars = [...from];
    const toChars = [...to];
    for (const list of pairs) {
      const chars = [...list];
      for (let i = 0; i < chars.length; i += 2) {
        const at = fromChars.indexOf(chars[i]);
        assert.ok(at >= 0, `translate has ${chars[i]}`);
        assert.equal(toChars[at], chars[i + 1], chars[i]);
      }
    }
    assert.match(sql, /'!\(\?=\[a-z\]\)', 'i'/);
    assert.match(sql, /'\\\|\(\?=\[a-z\]\)', 'l'/);
    assert.match(sql, /'\\\+\(\?=\[a-z\]\)', 't'/);
    assert.match(sql, /replace\(base, 'ph', 'f'\)/);
  });

  it("raises the app's own messages", () => {
    assert.ok(sql.includes(`problem constant text := ${quoted(CONTENT_PROBLEM)};`));
    assert.equal((sql.match(/raise exception '%', problem using errcode = '23514';/g) ?? []).length, 6);
    assert.match(sql, /raise exception 'Your account is suspended' using errcode = '42501';/);
    assert.ok(sql.includes(`raise exception ${quoted(REPORT_LIMIT_MESSAGE)}`));
    assert.ok(sql.includes(`) >= ${REPORT_DAILY_LIMIT} then`));
  });

  it("guards posts, comments, messages and profiles, and checks only new or changed text", () => {
    for (const table of ["posts", "comments", "messages", "profiles"]) {
      assert.ok(
        sql.includes(`before insert or update on public.${table}\n  for each row execute function private.guard_user_text();`),
        table,
      );
    }
    for (const column of ["content", "body", "username", "display_name", "bio"]) {
      assert.ok(sql.includes(`new.${column} is distinct from old.${column}`), column);
    }
    assert.match(sql, /banned_until > now\(\)/);
    assert.match(sql, /create or replace function private\.is_suspended\(uid uuid\)[\s\S]*?security definer\s+set search_path = ''/);
  });

  it("revokes execute on every function", () => {
    for (const fn of [
      "filter_normalise(text)",
      "filter_pattern(text)",
      "blocked_text(text)",
      "is_suspended(uuid)",
      "guard_user_text()",
      "cap_reports()",
    ]) {
      assert.ok(sql.includes(`revoke all on function private.${fn} from public, anon, authenticated;`), fn);
    }
  });
});
