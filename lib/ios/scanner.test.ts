import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanCaptureFrom } from "./scanner";

describe("scanCaptureFrom", () => {
  it("keeps the lines, back, crop and kind", () => {
    assert.deepEqual(
      scanCaptureFrom({ lines: ["LUKA DONCIC", 7, "PRIZM"], backLines: ["#280"], image: "QUJD", kind: "card" }),
      { lines: ["LUKA DONCIC", "PRIZM"], backLines: ["#280"], image: "data:image/jpeg;base64,QUJD", kind: "card", border: null },
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

describe("front then back: the back's photo and the ask", () => {
  const front = { lines: ["CAMERON BOOZER"], image: "data:image/jpeg;base64,QUJD" };

  it("keeps the back's photo beside its read, for the reveal, and that the camera asked", () => {
    const capture = scanCaptureFrom({ ...front, backLines: ["RC-3"], backImage: "data:image/jpeg;base64,REVG", backAsked: true });
    assert.equal(capture?.backImage, "data:image/jpeg;base64,REVG");
    assert.equal(capture?.backAsked, true);
  });

  it("drops a back photo with no back read, one that isn't a photo, and an ask that isn't true", () => {
    assert.equal(scanCaptureFrom({ ...front, backImage: "data:image/jpeg;base64,REVG" })?.backImage, undefined);
    assert.equal(scanCaptureFrom({ ...front, backLines: ["RC-3"], backImage: "javascript:alert(1)" })?.backImage, undefined);
    assert.equal(scanCaptureFrom({ ...front, backAsked: "yes" })?.backAsked, undefined);
  });

  it("an older app build's result is unchanged", () => {
    const capture = scanCaptureFrom({ ...front, backLines: ["RC-3"] });
    assert.ok(capture && !("backImage" in capture) && !("backAsked" in capture));
  });
});
