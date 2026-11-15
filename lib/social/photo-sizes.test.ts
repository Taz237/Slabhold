import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { forgetPhotoSizes, knownPhotoSize, rememberPhotoSize } from "./photo-sizes";

describe("photo sizes", () => {
  beforeEach(() => forgetPhotoSizes());

  it("remembers a loaded photo's natural size", () => {
    assert.equal(knownPhotoSize("a.jpg"), null);
    rememberPhotoSize("a.jpg", 1200, 1500);
    assert.deepEqual(knownPhotoSize("a.jpg"), { width: 1200, height: 1500 });
  });

  it("ignores a photo that has not loaded", () => {
    rememberPhotoSize("b.jpg", 0, 0);
    rememberPhotoSize("", 10, 10);
    assert.equal(knownPhotoSize("b.jpg"), null);
    assert.equal(knownPhotoSize(""), null);
  });

  it("keeps a bounded number of photos and drops the oldest", () => {
    for (let i = 0; i < 401; i += 1) rememberPhotoSize(`p${i}.jpg`, 10, 10);
    assert.equal(knownPhotoSize("p0.jpg"), null);
    assert.deepEqual(knownPhotoSize("p400.jpg"), { width: 10, height: 10 });
  });
});
