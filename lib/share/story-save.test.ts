import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isIosDevice, storySaveMethod } from "./story-save";

describe("save for Stories", () => {
  it("shares the file when the browser can, opens it on iPhone otherwise, and downloads elsewhere", () => {
    assert.equal(storySaveMethod({ canShareFiles: true, ios: true }), "share-files");
    assert.equal(storySaveMethod({ canShareFiles: true, ios: false }), "share-files");
    assert.equal(storySaveMethod({ canShareFiles: false, ios: true }), "open");
    assert.equal(storySaveMethod({ canShareFiles: false, ios: false }), "download");
  });

  it("knows an iPhone, and an iPad asking for the desktop site", () => {
    assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), true);
    assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }), true);
    assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
    assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15)" }), false);
  });
});
