import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSoldSearchQuery,
  expectedSerialRun,
  titleMatchesCard,
  titleSerialOk,
  titleSerialRuns,
  type MatchCard,
} from "@/lib/comps/match";

describe("titleSerialOk", () => {
  it("accepts every common way of writing /99 for a /99 card", () => {
    const titles = [
      "2023 Panini Prizm Wembanyama #136 Purple /99",
      "2023 Panini Prizm Wembanyama #136 Purple #/99",
      "2023 Panini Prizm Wembanyama #136 Purple 23/99",
      "2023 Panini Prizm Wembanyama #136 Purple #'d to 99",
      "2023 Panini Prizm Wembanyama #136 Purple #’d to 99",
      "2023 Panini Prizm Wembanyama #136 Purple numbered to 99",
      "2023 Panini Prizm Wembanyama #136 Purple Numbered /99",
      "2023 Panini Prizm Wembanyama #136 Purple 23 / 99",
    ];
    for (const title of titles) assert.equal(titleSerialOk(title, 99), true, title);
  });

  it("accepts 1 of 1 and 1/1 for a one of one", () => {
    assert.equal(titleSerialOk("Prizm Black 1 of 1 Wembanyama", 1), true);
    assert.equal(titleSerialOk("Prizm Black 1/1 Wembanyama", 1), true);
    assert.equal(titleSerialOk("Prizm Black One of One Wembanyama", 1), true);
    assert.equal(titleSerialOk("Prizm Black 1/1 Wembanyama", 99), false);
  });

  it("rejects another run for a /99 card", () => {
    assert.equal(titleSerialOk("Prizm Blue Wembanyama /49", 99), false);
    assert.equal(titleSerialOk("Prizm Blue Wembanyama /199", 99), false);
    assert.equal(titleSerialOk("Prizm Blue Wembanyama 12/199", 99), false);
    assert.equal(titleSerialOk("Prizm Blue Wembanyama numbered to 49", 99), false);
    assert.equal(titleSerialOk("Prizm Blue Wembanyama", 99), false, "no serial in title");
  });

  it("ignores season and grade text", () => {
    assert.deepEqual(titleSerialRuns("2023/24 Panini Prizm Wembanyama #136"), []);
    assert.deepEqual(titleSerialRuns("2023/2024 Panini Prizm Wembanyama #136"), []);
    assert.deepEqual(titleSerialRuns("Wembanyama Prizm BGS 9.5/10"), []);
    assert.equal(titleSerialOk("2023/24 Panini Prizm Wembanyama #136 Silver", null), true);
    assert.equal(titleSerialOk("2023/24 Panini Prizm Wembanyama #136 BGS 9.5/10", null), true);
    assert.equal(titleSerialOk("2023/24 Panini Prizm Wembanyama Purple /99", 99), true);
    assert.equal(titleSerialOk("2023/24 Prizm Wembanyama Purple BGS 9.5/10 /99", 99), true);
    assert.equal(titleSerialOk("2023/24 Panini Prizm Wembanyama Purple", 99), false);
  });

  it("still keeps numbered listings out of an unnumbered card's comps", () => {
    assert.equal(titleSerialOk("Prizm Wembanyama Purple /99", null), false);
    assert.equal(titleSerialOk("Prizm Wembanyama Purple #'d to 99", null), false);
    assert.equal(titleSerialOk("Prizm Wembanyama Black 1 of 1", undefined), false);
  });

  it("feeds titleMatchesCard", () => {
    const card: MatchCard = {
      playerName: "Victor Wembanyama",
      year: 2023,
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      cardNumber: "136",
      parallel: "Purple",
      serialRun: 99,
      conditionType: "raw",
    };
    assert.equal(
      titleMatchesCard("2023-24 Panini Prizm Victor Wembanyama #136 Purple #'d to 99", card),
      true,
    );
    assert.equal(
      titleMatchesCard("2023-24 Panini Prizm Victor Wembanyama #136 Purple /49", card),
      false,
    );
  });
});

describe("expectedSerialRun", () => {
  const base: MatchCard = {
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Purple",
  };

  it("uses the saved run first, then the checklist, then nothing", () => {
    assert.equal(expectedSerialRun({ ...base, serialRun: 49 }, () => 99), 49);
    assert.equal(expectedSerialRun({ ...base, serialRun: null }, () => 99), 99);
    assert.equal(expectedSerialRun({ ...base, serialRun: null }), null);
    assert.equal(expectedSerialRun({ ...base, serialRun: 0 }, () => null), null);
  });

  it("does not change the sold search for a card that already has a run", () => {
    assert.equal(
      buildSoldSearchQuery({ ...base, serialRun: 99 }),
      "2023-24 Panini Prizm Victor Wembanyama #136 Purple /99",
    );
    assert.equal(
      buildSoldSearchQuery({ ...base, serialRun: null }),
      "2023-24 Panini Prizm Victor Wembanyama #136 Purple",
    );
  });
});

describe("titleSerialRuns card numbers", () => {
  it("does not read a #D card number as a run", () => {
    assert.deepEqual(titleSerialRuns("2024 Donruss Optic #D12 Downtown"), []);
  });
});
