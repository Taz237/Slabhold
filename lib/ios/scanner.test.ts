import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanCaptureFrom, scanDeniedFrom } from "./scanner";

describe("scanCaptureFrom", () => {
  it("keeps the lines, back, crop and kind", () => {
    assert.deepEqual(
      scanCaptureFrom({ lines: ["LUKA DONCIC", 7, "PRIZM"], backLines: ["#280"], image: "QUJD", kind: "card" }),
      { lines: ["LUKA DONCIC", "PRIZM"], backLines: ["#280"], image: "data:image/jpeg;base64,QUJD", kind: "card" },
    );
  });

  it("is null on cancel or a result with no lines", () => {
    assert.equal(scanCaptureFrom({ cancelled: true, lines: ["x"] }), null);
    assert.equal(scanCaptureFrom({ image: "QUJD" }), null);
    assert.equal(scanCaptureFrom(null), null);
    assert.equal(scanCaptureFrom("lines"), null);
  });

  it("drops an unknown kind, a bad image and caps long input", () => {
    const result = scanCaptureFrom({
      lines: Array.from({ length: 500 }, () => "y".repeat(900)),
      image: "javascript:alert(1)",
      kind: "binder",
    });
    assert.ok(result);
    assert.equal(result.kind, null);
    assert.equal(result.image, null);
    assert.equal(result.lines.length, 80);
    assert.equal(result.lines[0].length, 200);
    assert.equal(result.backLines, null);
  });
});

describe("scanDeniedFrom", () => {
  it("is true only for a cancel because camera access is off", () => {
    assert.equal(scanDeniedFrom({ cancelled: true, denied: true }), true);
    assert.equal(scanDeniedFrom({ cancelled: true }), false);
    assert.equal(scanDeniedFrom({ denied: true, lines: ["x"] }), false);
    assert.equal(scanDeniedFrom(null), false);
  });
});
