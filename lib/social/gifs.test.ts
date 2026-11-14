import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BLOCKED_ENTRIES } from "@/lib/safety/content-filter";
import { gifColumnMissing, gifForSave, gifFromGiphy, gifLabel, isGiphyMediaUrl, sanitizeGif } from "./gifs";

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

  it("reads a real GIPHY search result", () => {
    const base = "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExcW5xY2N4ZmE4dGJ1eXdqNWQ0b2Z6aGRqdGQ3a3B6/3o7TKSjRrfIPjeiVyM";
    const tail = (rid: string) => `?cid=790b7611qnqccxfa8tbuywj5d4ofzhdjtd7kpz&ep=v1_gifs_search&rid=${rid}&ct=g`;
    const item = {
      type: "gif",
      id: "3o7TKSjRrfIPjeiVyM",
      url: "https://giphy.com/gifs/excited-3o7TKSjRrfIPjeiVyM",
      title: "Excited Celebration GIF",
      rating: "g",
      images: {
        original: {
          height: "270",
          width: "480",
          size: "1534234",
          url: `${base}/giphy.gif${tail("giphy.gif")}`,
          mp4: `${base}/giphy.mp4${tail("giphy.mp4")}`,
          webp: `${base}/giphy.webp${tail("giphy.webp")}`,
        },
        original_still: { height: "270", width: "480", url: `${base}/giphy_s.gif${tail("giphy_s.gif")}` },
        fixed_height: {
          height: "200",
          width: "356",
          url: `${base}/200.gif${tail("200.gif")}`,
          mp4: `${base}/200.mp4${tail("200.mp4")}`,
          webp: `${base}/200.webp${tail("200.webp")}`,
        },
        fixed_height_still: { height: "200", width: "356", url: `${base}/200_s.gif${tail("200_s.gif")}` },
        fixed_width: {
          height: "113",
          width: "200",
          url: `${base}/200w.gif${tail("200w.gif")}`,
          mp4: `${base}/200w.mp4${tail("200w.mp4")}`,
          webp: `${base}/200w.webp${tail("200w.webp")}`,
        },
        fixed_width_still: { height: "113", width: "200", url: `${base}/200w_s.gif${tail("200w_s.gif")}` },
      },
    };
    assert.deepEqual(gifFromGiphy(item), {
      id: "3o7TKSjRrfIPjeiVyM",
      mp4: `${base}/200w.mp4${tail("200w.mp4")}`,
      still: `${base}/200w_s.gif${tail("200w_s.gif")}`,
      width: 200,
      height: 113,
      title: "Excited Celebration GIF",
    });

    // What the messaging bundle sends: no *_still renditions at all.
    const { fixed_width_still: _a, fixed_height_still: _b, original_still: _c, ...noStills } = item.images;
    void [_a, _b, _c];
    assert.deepEqual(gifFromGiphy({ ...item, images: noStills }), {
      id: "3o7TKSjRrfIPjeiVyM",
      mp4: `${base}/200w.mp4${tail("200w.mp4")}`,
      still: `${base}/200w.webp${tail("200w.webp")}`,
      width: 200,
      height: 113,
      title: "Excited Celebration GIF",
    });

    // No webp either: the rendition's gif is the still.
    const { webp: _w, ...fixedWidthNoWebp } = item.images.fixed_width;
    void _w;
    assert.equal(gifFromGiphy({ ...item, images: { fixed_width: fixedWidthNoWebp } })?.still, `${base}/200w.gif${tail("200w.gif")}`);

    // Only fixed_height: that size is used.
    const onlyHeight = gifFromGiphy({ ...item, images: { fixed_height: item.images.fixed_height } });
    assert.equal(onlyHeight?.mp4, `${base}/200.mp4${tail("200.mp4")}`);
    assert.equal(onlyHeight?.width, 356);
    assert.equal(onlyHeight?.height, 200);

    // A still off GIPHY's hosts is still refused.
    assert.equal(
      gifFromGiphy({ ...item, images: { fixed_width: { ...item.images.fixed_width, webp: "https://evil.example/x.webp", url: "https://evil.example/x.gif" } } }),
      null,
    );
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

  it("leaves a title with a blocked word off the saved GIF, so the post still saves", () => {
    const blocked = BLOCKED_ENTRIES.find((entry): entry is string => typeof entry === "string")!;
    assert.deepEqual(gifForSave({ ...GIF, title: `so ${blocked} here` }), {
      id: GIF.id,
      mp4: MP4,
      still: STILL,
      width: 200,
      height: 113,
    });
    assert.deepEqual(gifForSave(GIF), GIF, "a clean title is kept");
    assert.equal(gifForSave({ ...GIF, mp4: "https://evil.example/x.mp4" }), null);
    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    assert.equal(remote.match(/gifForSave\(/g)?.length, 3, "posts, replies and edits all save through it");
    assert.doesNotMatch(remote, /sanitizeGif\(/);
  });
});
