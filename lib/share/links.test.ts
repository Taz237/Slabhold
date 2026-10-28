import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeImagePath,
  badgeSharePath,
  badgeShareText,
  cardImagePath,
  cardShareState,
  withShareRef,
  xIntentUrl,
} from "./links";

describe("share links", () => {
  it("adds ref=share once, keeping the path and other params", () => {
    assert.equal(withShareRef("https://slabhold.app/u/demo"), "https://slabhold.app/u/demo?ref=share");
    assert.equal(
      withShareRef("https://slabhold.app/u/demo?ref=feed&x=1"),
      "https://slabhold.app/u/demo?ref=share&x=1",
    );
  });

  it("encodes the X intent text and url", () => {
    const url = xIntentUrl({
      text: "Just unlocked Gold Collector on Slabhold & more #1",
      url: "https://slabhold.app/u/demo/badges/collector/gold?ref=share",
    });
    assert.equal(
      url,
      "https://x.com/intent/post?text=Just%20unlocked%20Gold%20Collector%20on%20Slabhold%20%26%20more%20%231" +
        "&url=https%3A%2F%2Fslabhold.app%2Fu%2Fdemo%2Fbadges%2Fcollector%2Fgold%3Fref%3Dshare",
    );
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://x.com");
    assert.equal(parsed.pathname, "/intent/post");
    assert.equal(parsed.searchParams.get("text"), "Just unlocked Gold Collector on Slabhold & more #1");
    assert.equal(
      parsed.searchParams.get("url"),
      "https://slabhold.app/u/demo/badges/collector/gold?ref=share",
    );
  });

  it("keeps emoji and quotes intact through the X intent", () => {
    const text = `"Pulled it" 🔥`;
    const parsed = new URL(xIntentUrl({ text, url: "https://slabhold.app/posts/1" }));
    assert.equal(parsed.searchParams.get("text"), text);
  });

  it("builds badge paths and copy", () => {
    assert.equal(badgeSharePath("DemoCollector", "collector", "gold"), "/u/democollector/badges/collector/gold");
    assert.equal(
      badgeImagePath("democollector", "slab-king", "legendary"),
      "/api/share-image/badge/democollector/slab-king/legendary",
    );
    assert.equal(badgeShareText("collector", "gold"), "Just unlocked Gold Collector on Slabhold");
  });
});

describe("card share state", () => {
  const id = "3f1c2b8e-1d2a-4f5b-9c8d-7e6f5a4b3c2d";

  it("private cards cannot be shared", () => {
    const state = cardShareState({ isPublic: false, username: "democollector", cardId: id });
    assert.deepEqual(state, { kind: "private", message: "Make this card public to share" });
  });

  it("a private card has no link or image, even with a username", () => {
    const state = cardShareState({ isPublic: false, username: "democollector", cardId: id });
    assert.equal("path" in state, false);
    assert.equal("imagePath" in state, false);
  });

  it("public cards share the profile card page and portrait image", () => {
    assert.deepEqual(cardShareState({ isPublic: true, username: "democollector", cardId: id }), {
      kind: "share",
      path: `/u/democollector/cards/${id}`,
      imagePath: cardImagePath(id),
    });
  });

  it("no username means nothing to link to yet", () => {
    assert.deepEqual(cardShareState({ isPublic: true, username: "", cardId: id }), { kind: "unavailable" });
  });
});
