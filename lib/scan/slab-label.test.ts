import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeSlabLabel, readSlabLabel } from "./slab-label";

/**
 * Fixtures are hand-written OCR lines in label order, top to bottom.
 * Cert numbers are made up. No real collector's card is used.
 */

describe("readSlabLabel: PSA", () => {
  it("reads a modern PSA label split across lines", () => {
    const read = readSlabLabel([
      "PSA",
      "2018 PANINI PRIZM",
      "#280",
      "LUKA DONCIC",
      "SILVER PRIZM",
      "GEM MT",
      "10",
      "45678912",
    ]);
    assert.equal(read.grader, "PSA");
    assert.equal(read.yearLabel, "2018");
    assert.equal(read.setName, "Panini Prizm");
    assert.equal(read.cardNumber, "280");
    assert.equal(read.playerText, "LUKA DONCIC");
    assert.equal(read.varietyText, "SILVER PRIZM");
    assert.equal(read.gradeNumber, "10");
    assert.equal(read.gradeQualifier, "");
    assert.equal(read.certNumber, "45678912");
    assert.equal(read.authentic, false);
  });

  it("reads a qualifier and a cert after the PSA word", () => {
    const read = readSlabLabel([
      "2017 TOPPS CHROME #169",
      "AARON JUDGE",
      "REFRACTOR",
      "MINT 9 (OC)",
      "PSA 51234567",
    ]);
    assert.equal(read.grader, "PSA");
    assert.equal(read.setName, "Topps Chrome");
    assert.equal(read.cardNumber, "169");
    assert.equal(read.playerText, "AARON JUDGE");
    assert.equal(read.varietyText, "REFRACTOR");
    assert.equal(read.gradeNumber, "9");
    assert.equal(read.gradeQualifier, "OC");
    assert.equal(read.certNumber, "51234567");
  });

  it("reads an Authentic label with no grade number", () => {
    const read = readSlabLabel(["PSA", "1986 FLEER #57", "MICHAEL JORDAN", "AUTHENTIC", "60012345"]);
    assert.equal(read.authentic, true);
    assert.equal(read.gradeNumber, "");
    assert.equal(read.setName, "Fleer");
    assert.equal(read.playerText, "MICHAEL JORDAN");
    assert.equal(read.varietyText, "");
  });

  it("fills the number from the words when the big number was missed", () => {
    const read = readSlabLabel([
      "2003 TOPPS CHROME #111",
      "LEBRON JAMES",
      "REFRACTOR",
      "GEM MT",
      "PSA",
      "82345671",
    ]);
    assert.equal(read.gradeNumber, "10");
  });

  it("keeps the autograph grade apart from the card grade", () => {
    const read = readSlabLabel([
      "PSA",
      "2024 TOPPS CHROME UPDATE #USC1",
      "PAUL SKENES",
      "ROOKIE AUTO",
      "NM-MT 8",
      "AUTO 10",
      "91234567",
    ]);
    assert.equal(read.setName, "Topps Chrome Update");
    assert.equal(read.cardNumber, "USC1");
    assert.equal(read.gradeNumber, "8");
    assert.equal(read.autoGrade, "10");
    assert.equal(read.varietyText, "ROOKIE AUTO");
    assert.equal(read.isRookie, true);
  });

  it("prefers the longer set name when Panini comes before Donruss Optic", () => {
    const read = readSlabLabel([
      "PSA",
      "2018 PANINI DONRUSS OPTIC #177",
      "LUKA DONCIC",
      "HOLO",
      "NM-MT 8",
      "40123456",
    ]);
    assert.equal(read.setName, "Donruss Optic");
    assert.equal(read.varietyText, "HOLO");
  });

  it("keeps a season year as printed", () => {
    const read = readSlabLabel(["PSA", "2023-24 PANINI PRIZM #136", "VICTOR WEMBANYAMA", "GEM MT 10", "71234567"]);
    assert.equal(read.yearLabel, "2023-24");
    assert.equal(read.setName, "Panini Prizm");
    assert.equal(read.gradeNumber, "10");
  });

  it("reads a grader and grade on one line", () => {
    const read = readSlabLabel(["2019 PANINI PRIZM #248", "ZION WILLIAMSON", "PSA 10", "61234567"]);
    assert.equal(read.grader, "PSA");
    assert.equal(read.gradeNumber, "10");
    assert.equal(read.playerText, "ZION WILLIAMSON");
    assert.equal(read.certNumber, "61234567");
  });

  it("fixes an O read in place of a zero in the grade", () => {
    const read = readSlabLabel(["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "GEM MT 1O", "45678912"]);
    assert.equal(read.gradeNumber, "10");
  });
});

describe("readSlabLabel: BGS", () => {
  it("reads set and parallel on one line and ignores subgrades", () => {
    const read = readSlabLabel([
      "BECKETT",
      "2018 Panini Prizm Silver Prizm",
      "#280 Luka Doncic",
      "9.5",
      "GEM MINT",
      "CENTERING 9.5",
      "CORNERS 9.5",
      "EDGES 10",
      "SURFACE 9",
      "0012345678",
    ]);
    assert.equal(read.grader, "BGS");
    assert.equal(read.setName, "Panini Prizm");
    assert.equal(read.varietyText, "Silver Prizm");
    assert.equal(read.cardNumber, "280");
    assert.equal(read.playerText, "Luka Doncic");
    assert.equal(read.gradeNumber, "9.5");
    assert.equal(read.certNumber, "0012345678");
  });

  it("knows a BGS label from its subgrades when the logo is not read", () => {
    const read = readSlabLabel([
      "2020 Panini Prizm #258",
      "Anthony Edwards",
      "PRISTINE",
      "CENTERING 10",
      "CORNERS 10",
      "EDGES 10",
      "SURFACE 10",
      "0098765432",
    ]);
    assert.equal(read.grader, "BGS");
    assert.equal(read.gradeNumber, "10");
  });
});

describe("readSlabLabel: SGC and CGC", () => {
  it("reads an SGC label", () => {
    const read = readSlabLabel([
      "SGC",
      "2023 PANINI PRIZM #136",
      "VICTOR WEMBANYAMA",
      "SILVER",
      "10",
      "GEM MINT",
      "1234567",
    ]);
    assert.equal(read.grader, "SGC");
    assert.equal(read.cardNumber, "136");
    assert.equal(read.varietyText, "SILVER");
    assert.equal(read.gradeNumber, "10");
    assert.equal(read.certNumber, "1234567");
  });

  it("reads a CGC label without taking the cert as the card number", () => {
    const read = readSlabLabel([
      "CGC CARDS",
      "2024 Topps Series 1 #1",
      "Shohei Ohtani",
      "MINT+ 9.5",
      "Cert # 4012345001",
    ]);
    assert.equal(read.grader, "CGC");
    assert.equal(read.setName, "Topps Series 1");
    assert.equal(read.cardNumber, "1");
    assert.equal(read.playerText, "Shohei Ohtani");
    assert.equal(read.gradeNumber, "9.5");
    assert.equal(read.certNumber, "4012345001");
  });
});

describe("readSlabLabel: edges", () => {
  it("uses the grader hint when no grader word is read", () => {
    const lines = ["2018 PANINI PRIZM #280", "LUKA DONCIC", "GEM MT 10", "45678912"];
    assert.equal(readSlabLabel(lines).grader, "");
    assert.equal(readSlabLabel(lines, { graderHint: "PSA" }).grader, "PSA");
  });

  it("keeps an unknown set as text only", () => {
    const read = readSlabLabel(["PSA", "2020 SAGE HIT #12", "SOME PLAYER", "MINT 9", "31234567"]);
    assert.equal(read.setName, "");
    assert.equal(read.setText, "SAGE HIT");
    assert.equal(read.cardNumber, "12");
  });

  it("returns an empty read for no lines", () => {
    const read = readSlabLabel([]);
    assert.equal(read.grader, "");
    assert.equal(read.gradeNumber, "");
    assert.equal(read.certNumber, "");
    assert.deepEqual(read.cardLines, []);
  });

  it("ignores blank lines and caps very long input", () => {
    const noise = Array.from({ length: 500 }, () => "x".repeat(1000));
    const read = readSlabLabel(["", "  ", "PSA", ...noise]);
    assert.equal(read.grader, "PSA");
    assert.ok(read.cardLines.length <= 60);
  });
});

describe("looksLikeSlabLabel", () => {
  it("is true for a label with a grader and a grade", () => {
    assert.equal(looksLikeSlabLabel(["PSA", "2018 PANINI PRIZM #280", "GEM MT 10"]), true);
  });

  it("is true for BGS subgrades without a logo", () => {
    assert.equal(looksLikeSlabLabel(["CENTERING 9.5", "CORNERS 9", "EDGES 9.5", "SURFACE 9"]), true);
  });

  it("is false for the front of a raw card", () => {
    assert.equal(looksLikeSlabLabel(["LUKA DONCIC", "DALLAS", "PRIZM", "ROOKIE"]), false);
  });
});
