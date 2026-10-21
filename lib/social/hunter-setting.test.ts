import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { HunterSettingControl } from "@/components/hunter-setting";
import {
  HUNTER_SETTING_HELP,
  HUNTER_SETTING_LABEL,
  hunterPromptDismissKey,
  hunterPromptVisible,
  readShowAsHunter,
  saveAndReloadShowAsHunter,
  type HunterSettingDb,
  type HunterSettingFilter,
} from "@/lib/social/hunter-setting";

type Stored = { id: string; show_as_hunter: boolean };

function memoryDb(rows: Stored[]): HunterSettingDb & { rows: Stored[] } {
  return {
    rows,
    from(table: string) {
      if (table !== "profiles") throw new Error(table);
      let patch: { show_as_hunter: boolean } | null = null;
      let id = "";
      const api = {
        select(): HunterSettingFilter {
          return api;
        },
        update(values: { show_as_hunter: boolean }): HunterSettingFilter {
          patch = values;
          return api;
        },
        eq(column: string, value: string) {
          if (column === "id") id = value;
          return api;
        },
        async maybeSingle() {
          const row = rows.find((item) => item.id === id);
          if (!row) return { data: null, error: null };
          if (patch) row.show_as_hunter = patch.show_as_hunter;
          patch = null;
          return { data: { show_as_hunter: row.show_as_hunter }, error: null };
        },
      };
      return api;
    },
  };
}

describe("hunter setting", () => {
  it("saves the switch and reloads the stored value", async () => {
    const db = memoryDb([
      { id: "ada", show_as_hunter: false },
      { id: "ben", show_as_hunter: false },
    ]);
    assert.equal((await readShowAsHunter(db, "ada")).showAsHunter, false);
    assert.equal((await readShowAsHunter(db, "ben")).showAsHunter, false);

    const on = await saveAndReloadShowAsHunter(db, "ada", true);
    assert.equal(on.error, undefined);
    assert.equal(on.showAsHunter, true);
    assert.equal((await readShowAsHunter(db, "ada")).showAsHunter, true);
    assert.equal(db.rows[0]?.show_as_hunter, true);
    assert.equal((await readShowAsHunter(db, "ben")).showAsHunter, false);

    const off = await saveAndReloadShowAsHunter(db, "ada", false);
    assert.equal(off.error, undefined);
    assert.equal(off.showAsHunter, false);
    assert.equal((await readShowAsHunter(db, "ada")).showAsHunter, false);
    assert.equal(db.rows[0]?.show_as_hunter, false);
  });

  it("treats a missing flag as off and keeps the prompt hidden after dismiss or opt-in", () => {
    assert.equal(hunterPromptVisible({ showAsHunter: false, dismissed: false }), true);
    assert.equal(hunterPromptVisible({ showAsHunter: true, dismissed: false }), false);
    assert.equal(hunterPromptVisible({ showAsHunter: false, dismissed: true }), false);
    assert.equal(hunterPromptDismissKey("ada"), "slabhold.hunter-prompt.dismissed.ada");
  });

  it("renders the privacy switch off by default with the helper text", () => {
    assert.equal(HUNTER_SETTING_LABEL, "Show me as a hunter on cards I want");
    assert.equal(
      HUNTER_SETTING_HELP,
      "Others can see you want a card and follow you. Prices and notes stay private.",
    );
    const off = renderToStaticMarkup(
      createElement(HunterSettingControl, { checked: false, disabled: false, onToggle() {} }),
    );
    assert.match(off, /Show me as a hunter on cards I want/);
    assert.match(off, /Others can see you want a card and follow you\. Prices and notes stay private\./);
    assert.match(off, /role="switch"/);
    assert.match(off, /aria-checked="false"/);
    const on = renderToStaticMarkup(
      createElement(HunterSettingControl, { checked: true, disabled: false, onToggle() {} }),
    );
    assert.match(on, /aria-checked="true"/);
  });

  it("wires the setting, the want-list prompt, and the public privacy line", () => {
    const setting = readFileSync(join(process.cwd(), "components", "hunter-setting.tsx"), "utf8");
    const privacy = readFileSync(join(process.cwd(), "components", "privacy-lists.tsx"), "utf8");
    const wants = readFileSync(join(process.cwd(), "components", "want-list.tsx"), "utf8");
    const policy = readFileSync(join(process.cwd(), "app", "privacy", "page.tsx"), "utf8");
    const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    assert.match(setting, /saveAndReloadShowAsHunter/);
    assert.match(setting, /href="\/settings\/privacy"/);
    assert.match(setting, /hunterPromptVisible/);
    assert.match(setting, /hunterPromptDismissKey/);
    assert.match(privacy, /HunterSettingSwitch/);
    assert.match(wants, /HunterPrompt/);
    assert.match(policy, /Hunters is opt-in/);
    const policyStart = schema.indexOf('create policy "Users update own profile"');
    assert.ok(policyStart >= 0);
    const policySql = schema.slice(policyStart, policyStart + 180);
    assert.match(policySql, /on public\.profiles for update\s+using \(auth\.uid\(\) = id\)/);
    assert.doesNotMatch(policySql, /show_as_hunter/);
    assert.match(schema, /grant insert, update, delete on public\.profiles to authenticated;/);
    assert.doesNotMatch(schema, /grant update \([^)]*\) on public\.profiles/i);
  });
});
