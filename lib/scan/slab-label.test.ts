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

describe("readSlabLabel: messy reads", () => {
  it("reads SGC's short grades: 10 GM, 9 MT, 9.5 MT+, 8.5 NM/MT+, 10 PRI", () => {
    const grade = (line: string) => {
      const read = readSlabLabel(["SGC", "2011 TOPPS UPDATE", "MIKE TROUT", "#US175", line, "1357924"]);
      return [read.gradeNumber, read.varietyText];
    };
    assert.deepEqual(grade("10 GM"), ["10", ""]);
    assert.deepEqual(grade("9 MT"), ["9", ""]);
    assert.deepEqual(grade("9.5 MT+"), ["9.5", ""]);
    assert.deepEqual(grade("8.5 NM/MT+"), ["8.5", ""]);
    assert.deepEqual(grade("10 PRI"), ["10", ""]);
  });

  it("takes a row of four grade numbers as BGS subgrades, not card text", () => {
    const read = readSlabLabel(["2020 PANINI PRIZM", "#325 JUSTIN HERBERT", "SILVER PRIZM", "GEM MINT 9.5", "9.5 9.5 9.5 10", "0012345678"]);
    assert.equal(read.hasSubgrades, true);
    assert.equal(read.grader, "BGS");
    assert.equal(read.gradeNumber, "9.5");
    assert.equal(read.varietyText, "SILVER PRIZM");
  });

  it("reads a grade at the end of card lines when the rows are read across", () => {
    const read = readSlabLabel(["2018 PANINI PRIZM #280", "LUKA DONCIC GEM MT", "SILVER PRIZM 10", "PSA", "45678912"]);
    assert.equal(read.gradeNumber, "10");
    assert.equal(read.playerText, "LUKA DONCIC");
    assert.equal(read.varietyText, "SILVER PRIZM");
    assert.equal(read.cardNumber, "280");
    assert.equal(read.certNumber, "45678912");
  });

  it("never takes a set's SERIES 2, or a number the grade words don't stand for, as the grade", () => {
    const read = readSlabLabel(["CGC", "Connor Bedard", "2023 Upper Deck Series 2", "#451 Young Guns", "MINT", "4098765432"]);
    assert.equal(read.setName, "Upper Deck Series 2");
    assert.equal(read.gradeNumber, "9");
    const eight = readSlabLabel(["PSA", "2020 PANINI PRIZM", "#325", "JUSTIN HERBERT", "SILVER PRIZM 10", "NM-MT", "52345678"]);
    assert.equal(eight.gradeNumber, "8", "NM-MT stands for 8: the 10 stays where it was printed");
    assert.equal(eight.varietyText, "SILVER PRIZM 10");
  });

  it("reads a stamped serial off the label and keeps it out of the variety and the card #", () => {
    const full = readSlabLabel(["BECKETT", "2023 BOWMAN CHROME", "PROSPECT AUTOGRAPHS #CPA-MC", "MAX CLARK", "REFRACTOR AUTO 432/499", "9.5", "AUTOGRAPH 10", "0015551234"]);
    assert.deepEqual(full.serial, { number: "432", run: "499" });
    assert.equal(full.cardNumber, "CPA-MC");
    assert.equal(full.varietyText.includes("499"), false);
    assert.equal(full.autoGrade, "10");
    const run = readSlabLabel(["PSA", "2024 PANINI PRIZM", "#301", "CALEB WILLIAMS", "BLUE ICE PRIZM /99", "GEM MT 10", "99887766"]);
    assert.deepEqual(run.serial, { number: "", run: "99" });
    assert.equal(run.varietyText, "BLUE ICE PRIZM");
    assert.equal(readSlabLabel(["PSA", "2023/24 PANINI PRIZM", "#136", "VICTOR WEMBANYAMA", "GEM MT 10"]).serial, null, "a season is not a serial");
  });

  it("reads PSA's CHR. as Chrome, and a set name that wraps onto the next line", () => {
    const short = readSlabLabel(["PSA", "2022 BOWMAN CHR.", "PROSPECTS", "#BCP-153", "JACKSON CHOURIO", "GEM MT 10", "71234567"]);
    assert.equal(short.setName, "Bowman Chrome");
    assert.equal(short.playerText, "JACKSON CHOURIO");
    assert.equal(short.varietyText, "PROSPECTS");
    const wrapped = readSlabLabel(["PSA", "2023 TOPPS CHROME", "UPDATE", "#USC150", "ELLY DE LA CRUZ", "MINT 9", "81234567"]);
    assert.equal(wrapped.setName, "Topps Chrome Update");
    assert.equal(wrapped.playerText, "ELLY DE LA CRUZ");
    assert.equal(wrapped.varietyText, "");
  });

  it("finds the player line wherever it sits when the caller knows the player", () => {
    const playerScore = (line: string) => (line.includes("LUKA DONCIC") ? 1 : 0);
    const read = readSlabLabel(["45678912", "GEM MT 10", "SILVER PRIZM", "LUKA DONCIC", "#280", "2018 PANINI PRIZM", "PSA"], { playerScore });
    assert.equal(read.playerText, "LUKA DONCIC");
    assert.equal(read.varietyText, "SILVER PRIZM");
    assert.equal(read.yearLabel, "2018");
    assert.equal(read.cardNumber, "280");
  });

  it("with no known player, takes the first line shaped like a name, never a set or variety line", () => {
    const read = readSlabLabel(["PSA", "2025 BOWMAN CHROME", "PROSPECTS", "#BCP-12", "CHARLIE CONDON", "GEM MT 10", "61234567"]);
    assert.equal(read.playerText, "CHARLIE CONDON");
    assert.equal(read.varietyText, "PROSPECTS");
    const reversed = readSlabLabel(["61234567", "GEM MT 10", "SILVER PRIZM", "C.J. STROUD", "#339", "2023 PANINI PRIZM", "PSA"]);
    assert.equal(reversed.playerText, "C.J. STROUD");
    assert.equal(reversed.varietyText, "SILVER PRIZM");
  });

  it("takes a rookie mark off the player line and still flags the rookie", () => {
    const read = readSlabLabel(["BGS", "2020 PANINI PRIZM #325", "JUSTIN HERBERT - RC", "SILVER PRIZM", "9.5", "GEM MINT", "0012345678"]);
    assert.equal(read.playerText, "JUSTIN HERBERT");
    assert.equal(read.isRookie, true);
    assert.equal(readSlabLabel(["2023 TOPPS CHROME UPDATE REFRACTOR", "#USC150", "ELLY DE LA CRUZ RC", "PSA", "MINT 9"]).playerText, "ELLY DE LA CRUZ");
  });

  it("never reads the cert as the card #, labelled or not", () => {
    for (const lines of [
      ["2024 PANINI PRIZM", "CALEB WILLIAMS", "RC", "GEM MT 10", "PSA", "98765432"],
      ["CGC CARDS", "2023 Panini Prizm", "Victor Wembanyama", "Silver Prizm", "GEM MINT 10", "Cert #4123456789"],
    ]) {
      const read = readSlabLabel(lines);
      assert.equal(read.cardNumber, "", lines.join(" | "));
      assert.ok(read.certNumber.length >= 8);
    }
  });
});
