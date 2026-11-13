import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADD_SHEET_COPY,
  addCardSheetHosted,
  addCardSheetOpen,
  addSheetRoute,
  closeAddCardSheet,
  openAddCardSheet,
  opensAddSheet,
  scanStartFrom,
  subscribeAddCardSheet,
} from "./add-card-sheet";

describe("Add card sheet routes", () => {
  it("sends both tiles to the scanner in the iOS app with the scanner on", () => {
    assert.deepEqual(addSheetRoute("scan", { native: true, scanner: true }), { kind: "scanner", href: "/scan" });
    assert.deepEqual(addSheetRoute("upload", { native: true, scanner: true }), {
      kind: "scanner",
      href: "/scan?start=library",
    });
  });

  it("opens the photo picker itself on the web, or with the scanner off", () => {
    for (const env of [
      { native: false, scanner: true },
      { native: false, scanner: false },
      { native: true, scanner: false },
    ]) {
      assert.deepEqual(addSheetRoute("scan", env), { kind: "picker", source: "camera" });
      assert.deepEqual(addSheetRoute("upload", env), { kind: "picker", source: "library" });
    }
  });

  it("reads ?start=library, and anything else is the camera", () => {
    assert.equal(scanStartFrom("library"), "library");
    assert.equal(scanStartFrom(["library", "camera"]), "library");
    assert.equal(scanStartFrom(undefined), "camera");
    assert.equal(scanStartFrom("nope"), "camera");
  });
});

describe("Add card sheet copy", () => {
  it("is two short labels, with no explanations or banned words", () => {
    assert.equal(ADD_SHEET_COPY.scan, "Scan");
    assert.equal(ADD_SHEET_COPY.upload, "Upload photo");
    for (const text of Object.values(ADD_SHEET_COPY)) {
      assert.ok(text.split(" ").length <= 2, text);
      assert.doesNotMatch(text, /\bAI\b|best|free|number one|mail day/i);
    }
  });
});

describe("Add card sheet open state", () => {
  it("opens on a plain click only, so new-tab clicks still navigate", () => {
    assert.equal(opensAddSheet({ button: 0 }), true);
    assert.equal(opensAddSheet({ button: 1 }), false);
    assert.equal(opensAddSheet({ button: 0, metaKey: true }), false);
    assert.equal(opensAddSheet({ button: 0, ctrlKey: true }), false);
    assert.equal(opensAddSheet({ button: 0, shiftKey: true }), false);
    assert.equal(opensAddSheet({ button: 0, defaultPrevented: true }), false);
  });

  it("is one shared sheet that tells its host when it opens and closes", () => {
    assert.equal(addCardSheetHosted(), false);
    let calls = 0;
    const stop = subscribeAddCardSheet(() => calls++);
    assert.equal(addCardSheetHosted(), true);
    openAddCardSheet();
    openAddCardSheet();
    assert.equal(addCardSheetOpen(), true);
    assert.equal(calls, 1, "a second open is a no-op");
    closeAddCardSheet();
    assert.equal(addCardSheetOpen(), false);
    assert.equal(calls, 2);
    stop();
    assert.equal(addCardSheetHosted(), false);
  });
});
