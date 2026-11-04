import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cardShape, forgetCardShapes, knownShape, rememberShape } from "@/lib/ui/card-shape";

describe("cardShape", () => {
  it("calls a clearly wide photo landscape", () => {
    assert.equal(cardShape(1400, 1000), "landscape");
    assert.equal(cardShape(700, 500), "landscape");
  });

  it("keeps tall, square and nearly square photos portrait", () => {
    assert.equal(cardShape(500, 700), "portrait");
    assert.equal(cardShape(1000, 1000), "portrait");
    // Within 10% of square: never flip a slightly wide crop.
    assert.equal(cardShape(1100, 1000), "portrait");
    assert.equal(cardShape(1101, 1000), "landscape");
  });

  it("treats a missing or broken size as portrait", () => {
    assert.equal(cardShape(0, 0), "portrait");
    assert.equal(cardShape(800, 0), "portrait");
    assert.equal(cardShape(Number.NaN, 500), "portrait");
  });
});

describe("shape cache", () => {
  beforeEach(() => forgetCardShapes());

  it("knows nothing about a photo it has not seen", () => {
    assert.equal(knownShape("https://example.com/a.jpg"), undefined);
    assert.equal(knownShape(null), undefined);
    assert.equal(knownShape(""), undefined);
  });

  it("remembers a measured photo so a revisit draws it right away", () => {
    assert.equal(rememberShape("https://example.com/wide.jpg", 1400, 1000), "landscape");
    assert.equal(knownShape("https://example.com/wide.jpg"), "landscape");
    assert.equal(rememberShape("https://example.com/tall.jpg", 500, 700), "portrait");
    assert.equal(knownShape("https://example.com/tall.jpg"), "portrait");
  });

  it("does not cache a photo with no size yet", () => {
    assert.equal(rememberShape("https://example.com/x.jpg", 0, 0), "portrait");
    assert.equal(knownShape("https://example.com/x.jpg"), undefined);
  });

  it("does not hold on to local data: URLs", () => {
    assert.equal(rememberShape("data:image/jpeg;base64,AAAA", 1400, 1000), "landscape");
    assert.equal(knownShape("data:image/jpeg;base64,AAAA"), undefined);
  });

  it("stays bounded", () => {
    for (let i = 0; i < 2000; i += 1) rememberShape(`https://example.com/${i}.jpg`, 700, 500);
    assert.equal(knownShape("https://example.com/0.jpg"), undefined);
    assert.equal(knownShape("https://example.com/1999.jpg"), "landscape");
  });
});

describe("shape cache keys", () => {
  beforeEach(() => forgetCardShapes());

  it("matches a stored URL with or without stray spaces", () => {
    rememberShape(" https://example.com/wide.jpg ", 1400, 1000);
    assert.equal(knownShape("https://example.com/wide.jpg"), "landscape");
  });
});
