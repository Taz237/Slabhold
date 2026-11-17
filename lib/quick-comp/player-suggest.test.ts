import assert from "node:assert/strict";
import { describe, it } from "node:test";
import names from "./data/player-names.json";
import { isPlayerName, nameKey, type PlayerNameRow } from "./player-names";
import { indexNames, playerSuggestions, suggestPlayerNames, surnameOf, titlePhrases } from "./player-suggest";
import roster from "@/lib/players/directory.json";

const rows = names as PlayerNameRow[];
const index = indexNames(rows);

describe("Player mode: name suggestions", () => {
  it("the names file covers the roster and the checklists", () => {
    const keys = new Set(rows.map(([name]) => nameKey(name)));
    for (const row of roster as { name: string }[]) {
      if (isPlayerName(row.name)) assert.ok(keys.has(nameKey(row.name)), row.name);
    }
    assert.ok(keys.has(nameKey("Darius Acuff Jr.")));
    assert.ok(!rows.some(([name]) => /checklist|\//i.test(name)));
  });

  it("darius suggests Darius Acuff Jr.", () => {
    const hits = suggestPlayerNames("darius", index);
    assert.ok(hits.includes("Darius Acuff Jr."), hits.join(", "));
    assert.equal(suggestPlayerNames("acuff", index)[0], "Darius Acuff Jr.");
    assert.equal(suggestPlayerNames("acuff dar", index)[0], "Darius Acuff Jr.");
    assert.deepEqual(suggestPlayerNames("d", index), []);
  });

  it("phrases from sold titles: Acuff auto, Acuff Prizm", () => {
    const titles = [
      "2025-26 Prizm Darius Acuff Jr. Silver",
      "Darius Acuff Jr Prizm Draft rookie",
      "Acuff Jr. auto Bowman Chrome /99",
      "Darius Acuff Jr. Autograph Bowman U",
      "Darius Acuff Jr. Prizm Silver",
      "Cooper Flagg Prizm auto",
    ];
    const phrases = titlePhrases("Darius Acuff Jr.", titles);
    assert.deepEqual(
      phrases.map((phrase) => phrase.label),
      ["Acuff Prizm", "Acuff auto"],
    );
    assert.deepEqual(phrases[1].filter, { auto: true });
    assert.deepEqual(phrases[0].filter, { set: "Prizm" });
    const list = playerSuggestions(["Darius Acuff Jr.", "Darius Adams"], phrases);
    assert.deepEqual(
      list.map((item) => item.label),
      ["Darius Acuff Jr.", "Acuff Prizm", "Acuff auto", "Darius Adams"],
    );
  });

  it("surnames skip the suffix", () => {
    assert.equal(surnameOf("Darius Acuff Jr."), "Acuff");
    assert.equal(surnameOf("Ken Griffey Jr"), "Griffey");
    assert.equal(surnameOf("Ohtani"), "Ohtani");
  });
});
