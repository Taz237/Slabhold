import assert from "node:assert/strict";
import { describe, it } from "node:test";
import aliases from "./data/player-name-aliases.json";
import names from "./data/player-names.json";
import { buildPlayerNames, nameKey, type PlayerNameRow } from "./player-names";

const rows = names as PlayerNameRow[];
const ALIASES = aliases as Record<string, string[]>;

describe("player-names.json: one spelling per player", () => {
  it("no two entries normalize to the same name (case, accents, periods, hyphens aside)", () => {
    const seen = new Map<string, string>();
    for (const [name] of rows) {
      const key = nameKey(name);
      assert.ok(!seen.has(key), `"${name}" and "${seen.get(key)}" are the same name`);
      seen.set(key, name);
    }
  });

  it("each alias is another spelling of its canonical name, and only the canonical one is in the file", () => {
    const inFile = new Set(rows.map(([name]) => name));
    const canonicalKeys = new Set<string>();
    for (const [canonical, variants] of Object.entries(ALIASES)) {
      assert.ok(inFile.has(canonical), `${canonical} is missing from player-names.json`);
      assert.ok(!canonicalKeys.has(nameKey(canonical)), `${canonical} is listed twice`);
      canonicalKeys.add(nameKey(canonical));
      assert.ok(variants.length > 0, canonical);
      for (const variant of variants) {
        assert.equal(nameKey(variant), nameKey(canonical), `${variant} is not a spelling of ${canonical}`);
        assert.ok(!inFile.has(variant), `${variant} is in the file beside ${canonical}`);
      }
    }
  });

  it("an old spelling still finds the player: Chris Godwin JR. and Jung HOO Lee", () => {
    const byKey = new Map(rows.map(([name]) => [nameKey(name), name]));
    assert.equal(byKey.get(nameKey("Chris Godwin JR.")), "Chris Godwin Jr.");
    assert.equal(byKey.get(nameKey("Jung HOO Lee")), "Jung Hoo Lee");
    assert.equal(byKey.get(nameKey("Rueben BAIN JR.")), "Rueben Bain Jr.");
    assert.equal(byKey.get(nameKey("Elmer Rodriguez")), "Elmer Rodríguez");
  });

  it("the builder keeps the canonical spelling whichever spelling it reads first", () => {
    const table = { "Chris Godwin Jr.": ["Chris Godwin JR."] };
    const read = (list: string[]) => buildPlayerNames(list.map((name) => ({ name, recent: true })), table);
    assert.deepEqual(read(["Chris Godwin JR.", "Chris Godwin Jr."]), [["Chris Godwin Jr.", 2]]);
    assert.deepEqual(read(["Chris Godwin Jr.", "Chris Godwin JR."]), [["Chris Godwin Jr.", 2]]);
    assert.deepEqual(read(["Chris Godwin JR."]), [["Chris Godwin Jr.", 1]]);
    // A name with no alias keeps the first spelling read, as before.
    assert.deepEqual(read(["TJ Moore", "T.J. Moore"]), [["TJ Moore", 2]]);
  });
});
