import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogPickStillMatches,
  catalogSubmissionIdentity,
  identitiesWithUserConsensus,
  logCatalogSearchMissQuietly,
  shouldLogCatalogSearchMiss,
  shouldSubmitCatalogCard,
  submitCatalogCardQuietly,
} from "@/lib/catalog/catalog-queue";

describe("shouldSubmitCatalogCard", () => {
  it("submits custom sets, custom parallels, and cards that were not picked", () => {
    assert.equal(
      shouldSubmitCatalogCard({
        setIsCustom: true,
        parallelIsCustom: false,
        pickedFromCatalog: true,
      }),
      true,
    );
    assert.equal(
      shouldSubmitCatalogCard({
        setIsCustom: false,
        parallelIsCustom: true,
        pickedFromCatalog: true,
      }),
      true,
    );
    assert.equal(
      shouldSubmitCatalogCard({
        setIsCustom: false,
        parallelIsCustom: false,
        pickedFromCatalog: false,
      }),
      true,
    );
  });

  it("skips an unchanged catalog pick", () => {
    assert.equal(
      shouldSubmitCatalogCard({
        setIsCustom: false,
        parallelIsCustom: false,
        pickedFromCatalog: true,
      }),
      false,
    );
  });
});

describe("catalogPickStillMatches", () => {
  const pick = {
    playerName: "Jaxson Dart",
    yearLabel: "2025",
    setBrand: "Panini Prizm",
    cardNumber: "332",
    parallel: "Base",
  };

  it("matches the same card ignoring case and a blank parallel", () => {
    assert.equal(
      catalogPickStillMatches(pick, {
        ...pick,
        playerName: "jaxson dart",
        parallel: "base",
      }),
      true,
    );
    assert.equal(
      catalogPickStillMatches(pick, { ...pick, parallel: "" }),
      true,
    );
  });

  it("does not match after the player or number changes, or without a pick", () => {
    assert.equal(
      catalogPickStillMatches(pick, { ...pick, playerName: "Jaxon Dart" }),
      false,
    );
    assert.equal(
      catalogPickStillMatches(pick, { ...pick, cardNumber: "333" }),
      false,
    );
    assert.equal(catalogPickStillMatches(null, pick), false);
  });
});

describe("catalog submission identity", () => {
  it("treats case, accents, and a blank parallel as one card", () => {
    const a = catalogSubmissionIdentity({
      player: "Luka Dončić",
      yearLabel: "2018-19",
      product: "Panini Prizm",
      cardNumber: "280",
      parallel: "Base",
    });
    const b = catalogSubmissionIdentity({
      player: "luka doncic",
      yearLabel: "2018-19",
      product: "panini prizm",
      cardNumber: "280",
      parallel: "",
    });
    assert.equal(a, b);
  });

  it("approves only when two different users share that identity", () => {
    const identity = catalogSubmissionIdentity({
      player: "Jaxson Dart",
      yearLabel: "2025",
      product: "Panini Prizm",
      cardNumber: "332",
      parallel: "Base",
    });
    const other = catalogSubmissionIdentity({
      player: "Jaxson Dart",
      yearLabel: "2025",
      product: "Panini Prizm",
      cardNumber: "333",
      parallel: "Base",
    });
    assert.deepEqual(
      identitiesWithUserConsensus([
        { userId: "user-a", identity },
        { userId: "user-a", identity },
        { userId: "user-b", identity },
        { userId: "user-a", identity: other },
        { userId: "user-b", identity: other },
      ]),
      [identity, other].sort(),
    );
    assert.deepEqual(
      identitiesWithUserConsensus([
        { userId: "user-a", identity },
        { userId: "user-a", identity },
      ]),
      [],
    );
    assert.deepEqual(
      identitiesWithUserConsensus([
        {
          userId: "user-a",
          identity: catalogSubmissionIdentity({ player: "  ", parallel: "Base" }),
        },
        {
          userId: "user-b",
          identity: catalogSubmissionIdentity({ player: "", parallel: "Base" }),
        },
      ]),
      [],
    );
  });
});

describe("catalog queue rpc", () => {
  it("logs only an empty remote result for a 3 to 100 character query", () => {
    assert.equal(shouldLogCatalogSearchMiss("wemby", 0), true);
    assert.equal(shouldLogCatalogSearchMiss("we", 0), false);
    assert.equal(shouldLogCatalogSearchMiss("wemby", 2), false);
    assert.equal(shouldLogCatalogSearchMiss("wemby", null), false);
    assert.equal(shouldLogCatalogSearchMiss("w".repeat(101), 0), false);
  });

  it("swallows a missing submit or miss-log rpc", async () => {
    const calls: string[] = [];
    const missing = async (fn: string) => {
      calls.push(fn);
      return { error: { code: "PGRST202", message: "Could not find the function" } };
    };
    await submitCatalogCardQuietly("card-1", missing);
    await submitCatalogCardQuietly("", missing);
    await logCatalogSearchMissQuietly("wemby", missing);
    await logCatalogSearchMissQuietly("we", missing);
    assert.deepEqual(calls, ["submit_catalog_card", "log_catalog_search_miss"]);

    await assert.doesNotReject(() =>
      submitCatalogCardQuietly("card-1", async () => {
        throw new Error("network");
      }),
    );
    await assert.doesNotReject(() =>
      logCatalogSearchMissQuietly("wemby", async () => {
        throw new Error("network");
      }),
    );
  });
});
