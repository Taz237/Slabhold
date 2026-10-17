import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterLoadedPostsForCard,
  sanitizeAttachedCard,
  toPublicAttachment,
} from "./card-posts";
import type { Post, PublicCard } from "./types";

function post(id: string, authorId: string, card: PublicCard, createdAt: string): Post {
  return {
    id,
    authorId,
    body: id,
    imageDataUrl: null,
    card,
    quotedPostId: null,
    createdAt,
  };
}

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
      quotedPostId: null,
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
      quotedPostId: null,
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
      quotedPostId: null,
      createdAt: "2026-10-17T12:00:00.000Z",
    },
  ];

  it("returns empty when card is not public", () => {
    const result = filterLoadedPostsForCard(posts, "card-a", new Set(), 5);
    assert.equal(result.posts.length, 0);
    assert.equal(result.hasMore, false);
  });

  it("includes another public copy of the same card and skips a different grade", () => {
    const base = {
      playerName: "Jordan Love",
      year: 2020,
      yearLabel: "2020",
      setBrand: "Panini Select",
      cardNumber: "47",
      sport: "Football",
      photoDataUrl: null,
      accent: "#7c5cff",
      estimatedSellPrice: 1,
      parallel: "Base",
      conditionType: "graded" as const,
      grade: "PSA 10",
      grader: "PSA",
    };
    const viewed: PublicCard = { ...base, id: "viewed" };
    const twin: PublicCard = { ...base, id: "twin", setBrand: "Select", cardNumber: "#47" };
    const psa9: PublicCard = { ...base, id: "psa9", grade: "PSA 9" };
    const raw: PublicCard = {
      ...base,
      id: "raw",
      conditionType: "raw",
      grade: "Raw",
      grader: undefined,
    };
    const silver: PublicCard = { ...base, id: "silver", parallel: "Silver" };
    const catalog = [viewed, twin, psa9, raw, silver];
    const result = filterLoadedPostsForCard(
      [
        post("same", "twin", twin, "2026-10-17T12:00:00.000Z"),
        post("nine", "psa9", psa9, "2026-10-17T13:00:00.000Z"),
        post("ungraded", "raw", raw, "2026-10-17T14:00:00.000Z"),
        post("color", "silver", silver, "2026-10-17T15:00:00.000Z"),
        post("direct", "viewed", viewed, "2026-10-16T12:00:00.000Z"),
      ],
      "viewed",
      new Set(catalog.map((card) => card.id)),
      5,
      { publicCards: catalog },
    );
    assert.deepEqual(
      result.posts.map((item) => item.id),
      ["same", "direct"],
    );
  });

  it("drops paid price when building a post attachment", () => {
    const card = toPublicAttachment({
      id: "c1",
      playerName: "Jordan Love",
      year: 2020,
      setBrand: "Panini Select",
      cardNumber: "47",
      sport: "Football",
      photoDataUrl: null,
      accent: "#7c5cff",
      estimatedSellPrice: 10,
      grade: "PSA 10",
      parallel: "Base",
    });
    assert.equal("purchasePrice" in card, false);
    assert.equal("notes" in card, false);
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
