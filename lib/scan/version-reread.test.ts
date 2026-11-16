import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIEW_SLAB_VERSION, PREVIEW_SOLDS } from "./preview-fixtures";
import { rowsWithVersion, sameCardRow, versionRereadSheet } from "./version-reread";
import type { ScanMatch } from "./match";

const OK = PREVIEW_SOLDS.status === "done" ? PREVIEW_SOLDS.comp : null;
const other: ScanMatch = { ...PREVIEW_SLAB_VERSION, catalogId: "fixture-other", playerName: "Second Player", cardNumber: "307" };

describe("reading a slab again as the version picked", () => {
  it("puts the pick and the typed serial on the top row, keeps the rest, and keeps the versions offered", () => {
    const rows = rowsWithVersion([other, PREVIEW_SLAB_VERSION], { name: "X-Fractor", serialRun: null }, "");
    assert.equal(rows[0].playerName, "Second Player");
    assert.equal(rows[0].parallel, "X-Fractor");
    assert.equal(rows[0].sureness.parallel, "sure");
    assert.equal(rows[1], PREVIEW_SLAB_VERSION);
    assert.deepEqual(rows[0].parallelOptions, other.parallelOptions);
    const gold = rowsWithVersion([other], { name: "Gold", serialRun: 50 }, "12");
    assert.equal(gold[0].serialRun, 50);
    assert.equal(gold[0].serialNo, "12");
    assert.equal(gold[0].parallelOptions[0].name, "Gold");
  });

  it("shows the sales only for the same card at the same version, on the very same rows", () => {
    assert.ok(OK);
    const rows = rowsWithVersion([PREVIEW_SLAB_VERSION, other], { name: "X-Fractor", serialRun: null }, "");
    const found = versionRereadSheet(rows, { matches: [{ ...rows[0], catalogId: "fresh" }], comp: OK!, query: "q" });
    assert.equal(found.matches, rows);
    assert.deepEqual(found.solds, { status: "done", comp: OK, query: "q", version: "X-Fractor" });
  });

  it("another card's or another version's prices are never shown: unavailable instead", () => {
    const rows = rowsWithVersion([other], { name: "X-Fractor", serialRun: null }, "");
    const unavailable = { status: "done", comp: { status: "unavailable" }, query: null, version: "X-Fractor" };
    assert.deepEqual(versionRereadSheet(rows, { matches: [PREVIEW_SLAB_VERSION], comp: OK!, query: "q" }).solds, unavailable);
    assert.deepEqual(versionRereadSheet(rows, { matches: [{ ...rows[0], parallel: "Refractor" }], comp: OK!, query: "q" }).solds, unavailable);
    assert.deepEqual(versionRereadSheet(rows, null).solds, unavailable);
    assert.equal(versionRereadSheet(rows, null).matches, rows);
  });

  it("the same card is the same player, year, set and card #, whatever the case or punctuation", () => {
    assert.equal(sameCardRow(other, { ...other, playerName: "SECOND PLAYER", setBrand: "topps chrome" }), true);
    assert.equal(sameCardRow(other, { ...other, cardNumber: "306" }), false);
  });
});
