import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIEW_RAW, PREVIEW_SLAB } from "./preview-fixtures";
import { cardInputFromScan, QUICK_ADD_COPY } from "./quick-add";

const options = { photo: "data:image/jpeg;base64,QUJD", accent: "#7C3AED", isPublic: false, value: 975 };

describe("one-tap add from the scan", () => {
  it("a slab with everything read saves as is: its grade, cert, parallel and photo", () => {
    const card = cardInputFromScan(PREVIEW_SLAB, options);
    assert.ok(card);
    assert.equal(card.playerName, PREVIEW_SLAB.playerName);
    assert.equal(card.yearLabel, PREVIEW_SLAB.yearLabel);
    assert.equal(card.year, 2018);
    assert.equal(card.setBrand, PREVIEW_SLAB.setBrand);
    assert.equal(card.cardNumber, PREVIEW_SLAB.cardNumber);
    assert.equal(card.parallel, "Silver");
    assert.equal(card.conditionType, "graded");
    assert.equal(card.grade, "PSA 10");
    assert.equal(card.certNumber, "00000000");
    assert.equal(card.photoDataUrl, options.photo);
    assert.equal(card.estimatedSellPrice, 975);
    assert.equal(card.purchasePrice, null);
    assert.equal(card.isPublic, false);
  });

  it("never saves a card with its parallel open: no silent Base", () => {
    assert.equal(cardInputFromScan({ ...PREVIEW_RAW[0], parallel: "" }, options), null);
  });

  it("a picked Base is saved as Base, raw", () => {
    const card = cardInputFromScan({ ...PREVIEW_RAW[0], parallel: "Base", grade: null }, options);
    assert.equal(card?.parallel, "Base");
    assert.equal(card?.conditionType, "raw");
    assert.equal(card?.grade, "");
  });

  it("a numbered card keeps the serial the photo printed (15/97)", () => {
    const card = cardInputFromScan({ ...PREVIEW_RAW[0], parallel: "Gold", serialRun: 97, serialNo: "15" }, options);
    assert.equal(card?.serialRun, 97);
    assert.equal(card?.serialNo, 15);
  });

  it("a card missing its year, set or card # isn't one tap: Add card asks", () => {
    for (const patch of [{ yearLabel: "" }, { setBrand: "" }, { cardNumber: "" }, { playerName: "" }]) {
      assert.equal(cardInputFromScan({ ...PREVIEW_RAW[0], parallel: "Base", ...patch }, options), null, JSON.stringify(patch));
    }
  });

  it("the copy is plain, and says nothing about selling", () => {
    const all = JSON.stringify(QUICK_ADD_COPY);
    assert.doesNotMatch(all, /\bbest\b|\bAI\b|\bfree\b|number one|sell|market|list it/i);
    assert.equal(QUICK_ADD_COPY.add, "Add to my collection");
  });
});
