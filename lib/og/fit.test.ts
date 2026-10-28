import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitQuote } from "./fit";

const box = { width: 1000, height: 300 };

describe("fitQuote", () => {
  it("sets short posts big", () => {
    const fit = fitQuote("New Puka added", box);
    assert.equal(fit.text, "New Puka added");
    assert.ok(fit.fontSize >= 72);
  });

  it("shrinks long posts so they fit without clipping", () => {
    const long = "Pulled a numbered Optic parallel from a hanger today and could not believe it. ".repeat(3).trim();
    const fit = fitQuote(long, box);
    assert.equal(fit.text, long);
    assert.ok(fit.fontSize < 56);
    assert.ok(fit.lines * fit.fontSize * fit.lineHeight <= box.height);
  });

  it("never cuts a word in half when it has to clip", () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const fit = fitQuote(words, { width: 600, height: 120 });
    assert.ok(fit.text.endsWith("…"));
    const kept = fit.text.slice(0, -1).trim().split(" ");
    for (const word of kept) assert.match(word, /^word\d+$/);
    assert.ok(words.startsWith(fit.text.slice(0, -1).trim()));
  });

  it("handles empty text", () => {
    assert.equal(fitQuote("   ", box).text, "");
  });
});

describe("fitQuote line cap", () => {
  it("keeps beside-photo text to three lines", () => {
    const text = "Finally landed the Puka Silver I have been chasing since last fall, and the corners are perfect on this one. ".repeat(3);
    const fit = fitQuote(text, { width: 560, height: 400, maxLines: 3, sizes: [48, 42, 36, 32] });
    assert.ok(fit.lines <= 3);
    assert.ok(fit.text.endsWith("…"));
  });
});
