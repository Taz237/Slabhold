import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { PublicCard } from "./types";
import {
  SHARE_CONFIRM_TEXT,
  SHARE_PRIVATE_REASON,
  sharePostFromCard,
  sharePostPath,
  shareSessionStore,
  shareToFeedControl,
  takeSharedPost,
  writeSharedPost,
  type ShareStore,
} from "./share-to-feed";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function card(photo: string | null = "data:image/jpeg;base64,abc"): PublicCard {
  return {
    id: "card-1",
    playerName: "Jordan Love",
    year: 2020,
    setBrand: "Select",
    cardNumber: "47",
    sport: "Football",
    photoDataUrl: photo,
    accent: "#7c5cff",
    estimatedSellPrice: 30,
    grade: "PSA 10",
    parallel: "Base",
  };
}

function memoryStore(): ShareStore & { value: string | null } {
  const store = {
    value: null as string | null,
    getItem() {
      return store.value;
    },
    setItem(_key: string, value: string) {
      store.value = value;
    },
    removeItem() {
      store.value = null;
    },
  };
  return store;
}

describe("share to feed", () => {
  it("stays off by default and blocks a private card", () => {
    assert.deepEqual(shareToFeedControl({ isPublic: true, share: false }), {
      checked: false,
      disabled: false,
      explanation: null,
    });
    const locked = shareToFeedControl({ isPublic: false, share: true });
    assert.equal(locked.checked, false);
    assert.equal(locked.disabled, true);
    assert.equal(locked.explanation, SHARE_PRIVATE_REASON);
    assert.match(SHARE_PRIVATE_REASON, /Private cards stay off the feed/);
    assert.equal(
      sharePostFromCard({ isPublic: false, share: true, caption: "Look", card: card() }),
      null,
    );
  });

  it("attaches the card once, without copying its photo onto the post", () => {
    const quiet = sharePostFromCard({
      isPublic: true,
      share: true,
      caption: "  ",
      card: card(),
    });
    assert.equal(quiet?.body, "");
    assert.equal(quiet?.imageDataUrl, null);
    assert.deepEqual(quiet?.images, []);
    assert.equal(quiet?.card.photoDataUrl, "data:image/jpeg;base64,abc");
    assert.equal(quiet?.card.id, "card-1");
    assert.equal(quiet?.shareOfNewCard, true);

    const captioned = sharePostFromCard({
      isPublic: true,
      share: true,
      caption: " Just landed ",
      card: card(null),
    });
    assert.equal(captioned?.body, "Just landed");
    assert.equal(captioned?.imageDataUrl, null);
    assert.deepEqual(captioned?.images, []);
    assert.equal(captioned?.card.playerName, "Jordan Love");

    assert.equal(
      sharePostFromCard({ isPublic: true, share: false, caption: "nope", card: card() }),
      null,
    );
  });

  it("confirms the share with a link to the post", () => {
    const store = memoryStore();
    writeSharedPost(store, "card-1", "post-9");
    assert.equal(takeSharedPost(store, "card-1"), "post-9");
    assert.equal(sharePostPath("post-9"), "/posts/post-9");
    assert.equal(takeSharedPost(store, "card-1"), null);
    assert.equal(SHARE_CONFIRM_TEXT, "Shared to your feed.");

    const form = read("components/card-form.tsx");
    assert.match(form, /Share to feed/);
    assert.match(form, /shareToFeedControl/);
    assert.match(form, /sharePostFromCard/);
    assert.match(form, /existing \? null : \(/);
    assert.match(form, /PRIVATE_VISIBILITY_HINT/);
    assert.match(
      read("lib/cards/visibility-choice.ts"),
      /Cards are private by default\. Your price paid stays private\./,
    );
    assert.match(read("components/card-detail.tsx"), /SharedPostNote/);
    assert.match(read("components/shared-post-note.tsx"), /View post/);
    assert.match(read("components/card-form.tsx"), /shareSessionStore/);
  });

  it("keeps a saved post when session storage throws", () => {
    const throwing: ShareStore = {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
      removeItem() {
        throw new Error("storage blocked");
      },
    };
    assert.doesNotThrow(() => writeSharedPost(throwing, "card-1", "post-9"));
    assert.equal(takeSharedPost(throwing, "card-1"), null);

    const sticky = {
      value: JSON.stringify({ cardId: "card-1", postId: "post-9" }),
      getItem() {
        return sticky.value;
      },
      setItem() {
        throw new Error("storage blocked");
      },
      removeItem() {
        throw new Error("storage blocked");
      },
    };
    assert.equal(takeSharedPost(sticky, "card-1"), "post-9");
    assert.equal(shareSessionStore(), null);
    const note = read("components/shared-post-note.tsx");
    assert.match(note, /try \{/);
    assert.match(note, /shareSessionStore/);
  });
});
