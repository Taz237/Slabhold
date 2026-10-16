import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterLoadedPostsForCard,
  sanitizeAttachedCard,
} from "./card-posts";
import type { Post } from "./types";

describe("sanitizeAttachedCard", () => {
  it("keeps public fields and drops paid/notes", () => {
    const card = sanitizeAttachedCard({
      id: "c1",
      playerName: "Wemby",
      year: 2023,
      setBrand: "Prizm",
      cardNumber: "136",
      sport: "Basketball",
      photoDataUrl: null,
      accent: "#7c5cff",
      estimatedSellPrice: 100,
      grade: "PSA 10",
      purchasePrice: 50,
      notes: "secret",
      paid: 50,
    });
    assert.ok(card);
    assert.equal(card.id, "c1");
    assert.equal(card.playerName, "Wemby");
    assert.equal(card.grade, "PSA 10");
    assert.equal("purchasePrice" in card && card.purchasePrice != null, false);
    assert.equal("notes" in (card as object), false);
  });

  it("returns null for invalid payloads", () => {
    assert.equal(sanitizeAttachedCard(null), null);
    assert.equal(sanitizeAttachedCard({ playerName: "x" }), null);
  });
});

describe("filterLoadedPostsForCard", () => {
  const posts: Post[] = [
    {
      id: "p1",
      authorId: "a1",
      body: "one",
      imageDataUrl: null,
      card: {
        id: "card-a",
        playerName: "A",
        year: 2020,
        setBrand: "S",
        cardNumber: "1",
        sport: "Basketball",
        photoDataUrl: null,
        accent: "#7c5cff",
        estimatedSellPrice: 1,
      },
      createdAt: "2026-10-16T12:00:00.000Z",
    },
    {
      id: "p2",
      authorId: "a1",
      body: "two",
      imageDataUrl: null,
      card: {
        id: "card-a",
        playerName: "A",
        year: 2020,
        setBrand: "S",
        cardNumber: "1",
        sport: "Basketball",
        photoDataUrl: null,
        accent: "#7c5cff",
        estimatedSellPrice: 1,
      },
      createdAt: "2026-10-15T12:00:00.000Z",
    },
    {
      id: "p3",
      authorId: "a1",
      body: "other",
      imageDataUrl: null,
      card: {
        id: "card-b",
        playerName: "B",
        year: 2021,
        setBrand: "S",
        cardNumber: "2",
        sport: "Basketball",
        photoDataUrl: null,
        accent: "#7c5cff",
        estimatedSellPrice: 1,
      },
      createdAt: "2026-10-17T12:00:00.000Z",
    },
  ];

  it("returns empty when card is not public", () => {
    const result = filterLoadedPostsForCard(posts, "card-a", new Set(), 5);
    assert.equal(result.posts.length, 0);
    assert.equal(result.hasMore, false);
  });

  it("returns newest first and respects limit", () => {
    const result = filterLoadedPostsForCard(
      posts,
      "card-a",
      new Set(["card-a"]),
      1,
    );
    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].id, "p1");
    assert.equal(result.hasMore, true);
  });
});
