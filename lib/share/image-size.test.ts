import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imageSize, readImageSize, IMAGE_HEAD_BYTES } from "./image-size";
import { jpegHead, pngHead, webpExtended, webpLossless, webpLossy } from "./image-size-fixtures";

describe("image header sizes", () => {
  it("reads JPEG SOF0 and progressive SOF2", () => {
    assert.deepEqual(imageSize(jpegHead(1400, 1000)), { width: 1400, height: 1000 });
    assert.deepEqual(imageSize(jpegHead(900, 1260, undefined, 0xc2)), { width: 900, height: 1260 });
  });

  it("swaps JPEG width and height when EXIF says the photo is turned", () => {
    assert.deepEqual(imageSize(jpegHead(1400, 1000, 6)), { width: 1000, height: 1400 });
    assert.deepEqual(imageSize(jpegHead(1400, 1000, 1)), { width: 1400, height: 1000 });
  });

  it("reads PNG IHDR", () => {
    assert.deepEqual(imageSize(pngHead(2100, 1500)), { width: 2100, height: 1500 });
  });

  it("reads lossy, lossless and extended WebP", () => {
    assert.deepEqual(imageSize(webpLossy(700, 500)), { width: 700, height: 500 });
    assert.deepEqual(imageSize(webpLossless(1234, 987)), { width: 1234, height: 987 });
    assert.deepEqual(imageSize(webpExtended(4000, 3000)), { width: 4000, height: 3000 });
  });

  it("returns null for unknown or cut-off bytes", () => {
    assert.equal(imageSize(new Uint8Array(0)), null);
    assert.equal(imageSize(Uint8Array.from([0x47, 0x49, 0x46, 0x38])), null);
    assert.equal(imageSize(jpegHead(1400, 1000).subarray(0, 24)), null);
    assert.equal(imageSize(pngHead(10, 10).subarray(0, 20)), null);
    assert.equal(imageSize(pngHead(0, 10)), null);
  });

  it("stops reading the body once the size is known, and never past 64 KB", async () => {
    let pulled = 0;
    const head = jpegHead(1400, 1000);
    const known = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(pulled === 1 ? head : new Uint8Array(1024));
      },
    });
    assert.deepEqual(await readImageSize(known), { width: 1400, height: 1000 });
    // The stream may pull one chunk ahead; the reader asks for no more.
    assert.ok(pulled <= 2, `pulled ${pulled}`);

    let read = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        read += 8192;
        controller.enqueue(new Uint8Array(8192));
      },
    });
    assert.equal(await readImageSize(endless), null);
    assert.ok(read <= IMAGE_HEAD_BYTES + 8192 * 2, `read ${read}`);
    assert.equal(await readImageSize(null), null);
  });
});
