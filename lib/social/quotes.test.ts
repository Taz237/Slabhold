import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUOTE_EMPTY_ERROR,
  isQuoteSubmitDisabled,
  quoteCount,
  resolveQuoteEmbedState,
  shouldConfirmDiscard,
  shouldNotifyQuoteAuthor,
  validateQuoteContent,
} from "./quotes";
import type { Post, Profile } from "./types";

function profile(partial: Partial<Profile> & Pick<Profile, "id" | "username">): Profile {
  return {
    email: "",
    displayName: partial.username,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function post(
  partial: Partial<Post> & Pick<Post, "id" | "authorId">,
): Post {
  return {
    body: "hello",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("validateQuoteContent", () => {
  it("rejects empty text with no attachment", () => {
    assert.equal(validateQuoteContent({ body: "   " }), QUOTE_EMPTY_ERROR);
    assert.equal(
      validateQuoteContent({ body: "", imageDataUrl: null, card: null }),
      QUOTE_EMPTY_ERROR,
    );
  });

  it("allows empty text when a card or image is attached", () => {
    assert.equal(
      validateQuoteContent({
        body: "",
        imageDataUrl: "data:image/png;base64,xx",
      }),
      null,
    );
    assert.equal(
      validateQuoteContent({
        body: "  ",
        card: {
          id: "c1",
          playerName: "A",
          year: 2024,
          setBrand: "Prizm",
          cardNumber: "1",
          sport: "Basketball",
          photoDataUrl: null,
          accent: "#7c5cff",
          estimatedSellPrice: 10,
        },
      }),
      null,
    );
  });

  it("allows non-empty text alone", () => {
    assert.equal(validateQuoteContent({ body: "Nice pull" }), null);
  });
});

describe("quote composer actions", () => {
  it("disables Quote when the draft is empty", () => {
    assert.equal(isQuoteSubmitDisabled({ body: "   " }), true);
    assert.equal(isQuoteSubmitDisabled({ body: "", imageDataUrl: null, card: null }), true);
  });

  it("enables Quote when there is text, a card, or an image", () => {
    assert.equal(isQuoteSubmitDisabled({ body: "Nice pull" }), false);
    assert.equal(
      isQuoteSubmitDisabled({ body: "", imageDataUrl: "data:image/png;base64,xx" }),
      false,
    );
  });

  it("asks to discard only when there is content", () => {
    assert.equal(shouldConfirmDiscard({ body: "" }), false);
    assert.equal(shouldConfirmDiscard({ body: "   ", imageDataUrl: null, hasCard: false }), false);
    assert.equal(shouldConfirmDiscard({ body: "hold" }), true);
    assert.equal(shouldConfirmDiscard({ body: "", imageDataUrl: "data:image/png;base64,xx" }), true);
    assert.equal(shouldConfirmDiscard({ body: "", hasCard: true }), true);
  });
});

describe("resolveQuoteEmbedState", () => {
  const alice = profile({ id: "a1", username: "alice", displayName: "Alice" });
  const bob = profile({ id: "b1", username: "bob", displayName: "Bob" });
  const carol = profile({ id: "c1", username: "carol", displayName: "Carol" });

  it("is unavailable when the original is missing", () => {
    const state = resolveQuoteEmbedState("missing", new Map(), new Map());
    assert.equal(state.kind, "unavailable");
  });

  it("is ok for a normal quoted post", () => {
    const original = post({ id: "p1", authorId: alice.id, body: "Original" });
    const state = resolveQuoteEmbedState(
      "p1",
      new Map([["p1", original]]),
      new Map([[alice.id, alice]]),
    );
    assert.equal(state.kind, "ok");
    if (state.kind === "ok") {
      assert.equal(state.post.id, "p1");
      assert.equal(state.nestedLink, null);
    }
  });

  it("shows a nested Quoting @handle link line when the quoted post is itself a quote", () => {
    const inner = post({ id: "p0", authorId: carol.id, body: "Deep" });
    const mid = post({
      id: "p1",
      authorId: bob.id,
      body: "Mid",
      quotedPostId: "p0",
    });
    const state = resolveQuoteEmbedState(
      "p1",
      new Map([
        ["p0", inner],
        ["p1", mid],
      ]),
      new Map([
        [bob.id, bob],
        [carol.id, carol],
      ]),
    );
    assert.equal(state.kind, "ok");
    if (state.kind === "ok") {
      assert.deepEqual(state.nestedLink, {
        handle: "carol",
        href: "/posts/p0",
      });
    }
  });
});

describe("shouldNotifyQuoteAuthor", () => {
  it("skips self-quotes and notifies others", () => {
    assert.equal(shouldNotifyQuoteAuthor("u1", "u1"), false);
    assert.equal(shouldNotifyQuoteAuthor("u1", null), false);
    assert.equal(shouldNotifyQuoteAuthor("u1", "u2"), true);
  });
});

describe("quoteCount", () => {
  it("counts posts that quote the original", () => {
    const posts = [
      post({ id: "q1", authorId: "a", quotedPostId: "orig" }),
      post({ id: "q2", authorId: "a", quotedPostId: "orig" }),
      post({ id: "q3", authorId: "a", quotedPostId: "other" }),
    ];
    assert.equal(quoteCount(posts, "orig"), 2);
  });
});
