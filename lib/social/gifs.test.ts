import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gifColumnMissing, gifFromGiphy, gifLabel, isGiphyMediaUrl, sanitizeGif } from "./gifs";

const MP4 = "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3/abc123/200w.mp4?cid=790b7611&ep=v1_gifs_search&rid=200w.mp4&ct=g";
const STILL = "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3/abc123/200w_s.gif?cid=790b7611&rid=200w_s.gif&ct=g";
const GIF = { id: "abc123", mp4: MP4, still: STILL, width: 200, height: 113, title: "Nice pull" };

describe("GIF values", () => {
  it("keeps a GIPHY GIF and drops unknown keys", () => {
    assert.deepEqual(sanitizeGif({ ...GIF, tracking: "x" }), GIF);
    assert.deepEqual(sanitizeGif({ ...GIF, width: "200", height: "113", title: "  " }), {
      id: "abc123",
      mp4: MP4,
      still: STILL,
      width: 200,
      height: 113,
    });
  });

  it("refuses anything that is not on GIPHY's media hosts", () => {
    for (const mp4 of [
      "https://evil.example/x.mp4",
      "https://media.giphy.com.evil.example/x.mp4",
      "https://giphy.com.evil.example/media/x.mp4",
      "http://media.giphy.com/media/x/giphy.mp4",
      "https://user@media.giphy.com/media/x/giphy.mp4",
      "https://media.giphy.com:8443/media/x/giphy.mp4",
      "https://media.giphy.com/media/../x/giphy.mp4",
      "https://media.giphy.com/media/x/giphy.mp4#frag",
      "https://media.giphy.com/media/x/giphy.gif",
      "https://media.giphy.com/media/x/giphy.mp4?next=https://evil.example",
      "javascript:alert(1)",
      "data:video/mp4;base64,AAAA",
      "",
      null,
    ]) {
      assert.equal(sanitizeGif({ ...GIF, mp4 }), null, String(mp4));
    }
    assert.equal(sanitizeGif({ ...GIF, still: "https://evil.example/x.gif" }), null);
    assert.equal(sanitizeGif({ ...GIF, still: MP4 }), null, "a still is an image");
  });

  it("refuses a bad id or size", () => {
    assert.equal(sanitizeGif({ ...GIF, id: "../x" }), null);
    assert.equal(sanitizeGif({ ...GIF, id: "" }), null);
    assert.equal(sanitizeGif({ ...GIF, width: 0 }), null);
    assert.equal(sanitizeGif({ ...GIF, height: 99999 }), null);
    assert.equal(sanitizeGif({ ...GIF, height: Number.NaN }), null);
    assert.equal(sanitizeGif(null), null);
    assert.equal(sanitizeGif("https://media.giphy.com/media/x/giphy.mp4"), null);
    assert.equal(sanitizeGif([GIF]), null);
  });

  it("accepts each GIPHY media host", () => {
    for (const host of ["media", "media0", "media4", "i"]) {
      assert.equal(isGiphyMediaUrl(`https://${host}.giphy.com/media/abc/giphy.mp4`, "mp4"), true, host);
    }
    assert.equal(isGiphyMediaUrl("https://media10.giphy.com/media/abc/giphy.mp4", "mp4"), false);
    assert.equal(isGiphyMediaUrl("https://api.giphy.com/media/abc/giphy.mp4", "mp4"), false);
  });

  it("reads a GIPHY API result, and falls back to the original size", () => {
    const item = {
      id: "abc123",
      title: "Nice pull",
      images: {
        fixed_width: { mp4: MP4, width: "200", height: "113" },
        fixed_width_still: { url: STILL },
        original: { mp4: "https://media2.giphy.com/media/abc123/giphy.mp4", width: "480", height: "270" },
        original_still: { url: "https://media2.giphy.com/media/abc123/giphy_s.gif" },
      },
    };
    assert.deepEqual(gifFromGiphy(item), GIF);
    const noFixed = { ...item, images: { original: item.images.original, original_still: item.images.original_still } };
    assert.deepEqual(gifFromGiphy(noFixed), {
      id: "abc123",
      mp4: "https://media2.giphy.com/media/abc123/giphy.mp4",
      still: "https://media2.giphy.com/media/abc123/giphy_s.gif",
      width: 480,
      height: 270,
      title: "Nice pull",
    });
    assert.equal(gifFromGiphy({ id: "abc123", images: {} }), null);
    assert.equal(gifFromGiphy({ id: "abc123" }), null);
    assert.equal(gifFromGiphy(null), null);
  });

  it("names a GIF for a screen reader", () => {
    assert.equal(gifLabel(GIF), "GIF: Nice pull");
    assert.equal(gifLabel({ ...GIF, title: undefined }), "GIF");
  });

  it("spots a database with no gif column yet", () => {
    assert.equal(gifColumnMissing({ code: "PGRST204", message: "Could not find the 'gif' column of 'posts'" }), true);
    assert.equal(gifColumnMissing({ code: "42703", message: "column posts.gif does not exist" }), true);
    assert.equal(gifColumnMissing({ code: "42703", message: "column posts.meta does not exist" }), false);
    assert.equal(gifColumnMissing({ code: "23514", message: "violates check constraint posts_gif_ok" }), false);
    assert.equal(gifColumnMissing(null), false);
  });
});
