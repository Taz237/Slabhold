import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { marketPlayer, nameKey, namesAgree, surnameAgrees, titlesForCard, withoutSuffix, type LookupCard } from "./player-lookup";

const titles = (...list: string[]) => list.map((title) => ({ title }));
const PRIZM_103: LookupCard = { years: ["2025-26"], setBrand: "Panini Prizm", cardNumber: "103", run: 175 };

describe("comparing a printed name with a source's name", () => {
  it("accents, case, periods, hyphens and Jr. never make two people", () => {
    assert.equal(nameKey("Ronald Acuña Jr."), nameKey("RONALD ACUNA"));
    assert.equal(nameKey("C.J. Stroud"), nameKey("CJ STROUD"));
    assert.equal(nameKey("Shai Gilgeous-Alexander"), nameKey("SHAI GILGEOUS ALEXANDER"));
    assert.ok(namesAgree("LABARON PHILON", "LaBaron Philon Jr."));
    assert.ok(namesAgree("De'Von Achane", "DEVON ACHANE"));
    assert.equal(withoutSuffix("Labaron Philon Jr."), "Labaron Philon");
    assert.equal(withoutSuffix("Marvin Harrison III"), "Marvin Harrison");
  });

  it("a small OCR slip in a long name still agrees; a short name must match exactly", () => {
    assert.ok(namesAgree("LABARON PHILCN", "LaBaron Philon"));
    assert.ok(namesAgree("LABAR0N PHILON", "LaBaron Philon"));
    assert.ok(namesAgree("CORBIN VANDERSL00T", "Corbin Vandersloot"));
    assert.equal(namesAgree("JO LEE", "Joe Lee"), false);
    assert.equal(namesAgree("TOM ROSS", "Tim Ross"), false);
  });

  it("two different players never agree", () => {
    assert.equal(namesAgree("LABARON PHILON", "Mark Sears"), false);
    assert.equal(namesAgree("BRYCE YOUNG", "Bryce Underwood"), false);
    assert.equal(namesAgree("", "Bryce Young"), false);
  });
});

describe("the market lookup: who the sold titles for a year, set and card # name", () => {
  const SOLD = titles(
    "2025-26 Panini Prizm NIL LaBaron Philon #103 Orange Pulsar /175 Alabama",
    "2025-26 Panini Prizm Basketball LaBaron Philon Orange Pulsar Prizm #103 70/175",
    "LABARON PHILON 2025-26 Prizm #103 Orange Pulsar /175 Alabama Crimson Tide SP",
    "2025-26 Panini Prizm #103 Labaron Philon Jr Orange Pulsar /175 PSA 10",
  );

  it("a clear majority naming one player is that player, spelled the way most titles spell it", () => {
    const found = marketPlayer(SOLD, PRIZM_103, SCAN_DIRECTORY);
    assert.ok(found);
    assert.ok(namesAgree(found.name, "LaBaron Philon"), found.name);
    assert.equal(found.of, 4);
    assert.ok(found.votes >= 3);
  });

  it("only titles for this card vote: the same card #, set and year, and no other print run", () => {
    const mixed = titles(
      ...SOLD.map((item) => item.title),
      "2025-26 Panini Prizm Mark Sears #104 Orange Pulsar /175",
      "2024-25 Panini Prizm Jared McCain #103 Silver",
      "2025-26 Panini Select Tre Johnson #103 /175",
      "2025-26 Panini Prizm Tre Johnson #103 Blue Pulsar /99",
      "2025-26 Panini Prizm lot of 12 cards #103 Philon and more",
    );
    assert.equal(titlesForCard(mixed, PRIZM_103, SCAN_DIRECTORY).length, 4);
    assert.ok(namesAgree(marketPlayer(mixed, PRIZM_103, SCAN_DIRECTORY)?.name ?? "", "LaBaron Philon"));
  });

  it("titles that split between two players name nobody: open beats wrong", () => {
    const split = titles(
      "2025-26 Panini Prizm LaBaron Philon #103 Orange Pulsar /175",
      "2025-26 Panini Prizm LaBaron Philon #103 /175",
      "2025-26 Panini Prizm Tobias Okonkwo #103 Orange Pulsar /175",
      "2025-26 Panini Prizm Tobias Okonkwo #103 /175",
    );
    assert.equal(marketPlayer(split, PRIZM_103, SCAN_DIRECTORY), null);
  });

  it("one title is never a majority, and titles that name no one name no one", () => {
    assert.equal(marketPlayer(SOLD.slice(0, 1), PRIZM_103, SCAN_DIRECTORY), null);
    assert.equal(marketPlayer(titles("2025-26 Panini Prizm #103 Orange Pulsar /175", "2025-26 Panini Prizm #103 Orange Pulsar /175 SP"), PRIZM_103, SCAN_DIRECTORY), null);
  });

  it("set, color, school, grade and seller words are never a name", () => {
    const noisy = titles(
      "2025-26 Panini Prizm #103 Orange Pulsar /175 Alabama Crimson Tide Free Shipping",
      "2025-26 Panini Prizm #103 Orange Pulsar /175 Alabama Crimson Tide Free Shipping PSA 10 Gem Mint",
      "2025-26 Panini Prizm #103 Orange Pulsar /175 Hot Rookie Case Hit",
    );
    assert.equal(marketPlayer(noisy, PRIZM_103, SCAN_DIRECTORY), null);
  });

  it("with no year, set or card # there is nothing to look up", () => {
    assert.equal(marketPlayer(SOLD, { ...PRIZM_103, cardNumber: "" }, SCAN_DIRECTORY), null);
    assert.equal(marketPlayer(SOLD, { ...PRIZM_103, years: [] }, SCAN_DIRECTORY), null);
    assert.equal(marketPlayer(SOLD, { ...PRIZM_103, setBrand: "" }, SCAN_DIRECTORY), null);
  });
});

describe("names the card words would hide", () => {
  it("a first name that is also a set word (Allen) still counts on another set's title", () => {
    const sold = titles("2023 Panini Prizm Allen Lazard #229 New York Jets", "2023 Prizm #229 Allen Lazard Jets", "Allen Lazard 2023 Panini Prizm Football #229");
    assert.equal(marketPlayer(sold, { years: ["2023"], setBrand: "Panini Prizm", cardNumber: "229", run: null }, SCAN_DIRECTORY)?.name, "Allen Lazard");
  });

  it("a surname alone agrees with the full name on the same card; a first name or a short word never does", () => {
    assert.ok(surnameAgrees("THOMPSON-ROBINSON", "Dorian Thompson-Robinson"));
    assert.ok(surnameAgrees("PHILON", "LaBaron Philon Jr."));
    assert.equal(surnameAgrees("DORIAN", "Dorian Thompson-Robinson"), false);
    assert.equal(surnameAgrees("LEE", "Joe Lee"), false);
    assert.equal(surnameAgrees("ROBINSON", "Robinson Cano"), false);
  });
});
