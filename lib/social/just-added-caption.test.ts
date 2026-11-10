import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_POST_HELD_REASON,
  FEED_POST_LABEL,
  SHARE_PRIVATE_REASON,
  addCardMayPost,
  cardPostFailed,
  cardPostId,
  clearCardPostFailed,
  composeWithCardPath,
  feedPostControl,
  justAddedCaption,
  recordCardPost,
  sharePostFromCard,
  takeComposeCaption,
  writeCardPostFailed,
  writeComposeCaption,
  type ShareStore,
} from "@/lib/social/share-to-feed";
import { toPublicAttachment } from "@/lib/social/card-posts";
import { POST_LIMIT } from "@/lib/social/types";
import { isBrandAccount } from "@/lib/leaderboard/brand-accounts";
import { isTestAccount } from "@/lib/test-accounts";

function memoryStore(): ShareStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const fixtureCard = {
  id: "card-1",
  playerName: "Tyrese Maxey",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Donruss",
  cardNumber: "7",
  parallel: "Downtown",
  grade: "Raw",
  conditionType: "raw" as const,
  isAuto: false,
  isRookie: false,
  isRelic: false,
  serialRun: null,
  serialNo: null,
  photoDataUrl: "https://example.test/photo.jpg",
  sport: "Basketball",
  accent: "#7C3AED",
  purchasePrice: 125,
  estimatedSellPrice: 300,
  notes: "paid 125 at the show",
  certNumber: "12345678",
  sellPrice: 400,
  sellDate: "2026-11-01",
  isPublic: true,
};

describe("Also post to my feed: caption", () => {
  it("builds 'Just added my 2024 Donruss Downtown Tyrese Maxey'", () => {
    assert.equal(
      justAddedCaption({ yearLabel: "2024", setBrand: "Donruss", parallel: "Downtown", playerName: "Tyrese Maxey" }),
      "Just added my 2024 Donruss Downtown Tyrese Maxey",
    );
  });

  it("leaves out Base and Parallel (not sure)", () => {
    assert.equal(
      justAddedCaption({ yearLabel: "2023-24", setBrand: "Panini Prizm", parallel: "Base", playerName: "Victor Wembanyama" }),
      "Just added my 2023-24 Panini Prizm Victor Wembanyama",
    );
    assert.equal(
      justAddedCaption({ yearLabel: "2024", setBrand: "Topps Chrome", parallel: "Parallel (not sure)", playerName: "Zach Neto" }),
      "Just added my 2024 Topps Chrome Zach Neto",
    );
  });

  it("never carries a price, paid amount, cert or notes, and stays under 280", () => {
    const caption = justAddedCaption(fixtureCard);
    assert.doesNotMatch(caption, /\$|125|300|12345678|paid|show/);
    const long = justAddedCaption({ yearLabel: "2024", setBrand: "S".repeat(400), parallel: "Gold", playerName: "P" });
    assert.ok(long.length <= POST_LIMIT);
    assert.equal(justAddedCaption({}), "");
  });
});

describe("Also post to my feed: the toggle", () => {
  it("keeps the Review label", () => {
    assert.equal(FEED_POST_LABEL, "Also post to my feed");
  });

  it("is off and locked while the card is private, even if asked", () => {
    assert.deepEqual(feedPostControl({ isPublic: false, choice: null, mayPost: true }), {
      checked: false,
      disabled: true,
      explanation: SHARE_PRIVATE_REASON,
    });
    assert.equal(feedPostControl({ isPublic: false, choice: true, mayPost: true }).checked, false);
    assert.equal(
      sharePostFromCard({ isPublic: false, share: true, caption: "hi", card: toPublicAttachment(fixtureCard) }),
      null,
    );
  });

  it("turns on once the card is public, and the collector can turn it off", () => {
    assert.equal(feedPostControl({ isPublic: true, choice: null, mayPost: true }).checked, true);
    assert.equal(feedPostControl({ isPublic: true, choice: false, mayPost: true }).checked, false);
    assert.equal(feedPostControl({ isPublic: true, choice: true, mayPost: true }).disabled, false);
  });

  it("stays off for brand, official and test accounts", () => {
    const held = feedPostControl({ isPublic: true, choice: null, mayPost: false });
    assert.deepEqual(held, { checked: false, disabled: true, explanation: FEED_POST_HELD_REASON });
    assert.equal(feedPostControl({ isPublic: true, choice: true, mayPost: false }).checked, false);
    assert.equal(addCardMayPost({ isBrand: true, isOfficial: false, isTest: false }), false);
    assert.equal(addCardMayPost({ isBrand: false, isOfficial: true, isTest: false }), false);
    assert.equal(addCardMayPost({ isBrand: false, isOfficial: false, isTest: true }), false);
    assert.equal(addCardMayPost({ isBrand: false, isOfficial: false, isTest: false }), true);
    assert.equal(isBrandAccount(null), false);
    assert.equal(isTestAccount("qa_fixture"), isTestAccount("qa_fixture"));
  });

  it("posts the custom caption, or an empty body with the card and no extra photo", () => {
    const card = toPublicAttachment(fixtureCard);
    const custom = sharePostFromCard({ isPublic: true, share: true, caption: "Downtown pulled!", card });
    assert.equal(custom?.body, "Downtown pulled!");
    assert.equal(custom?.shareOfNewCard, true);
    const empty = sharePostFromCard({ isPublic: true, share: true, caption: "   ", card });
    assert.equal(empty?.body, "");
    assert.equal(empty?.imageDataUrl, null);
    assert.deepEqual(empty?.images, []);
    assert.equal(empty?.card.id, "card-1");
    const attached = JSON.stringify(empty?.card);
    // Market value reaches the feed only through attachmentValueLabel, never price paid.
    for (const field of ["purchasePrice", "paidPrice", "notes", "certNumber", "sellPrice", "sellDate"]) {
      assert.doesNotMatch(attached, new RegExp(`"${field}"`), field);
    }
  });
});

describe("one add, one post", () => {
  it("remembers the post for this card and never clears it on read", () => {
    const store = memoryStore();
    assert.equal(cardPostId(store, "card-1"), null);
    recordCardPost(store, "card-1", "post-9");
    assert.equal(cardPostId(store, "card-1"), "post-9");
    assert.equal(cardPostId(store, "card-1"), "post-9");
    assert.equal(cardPostId(store, "card-2"), null);
  });

  it("records a failed post with its caption, and a later post clears it", () => {
    const store = memoryStore();
    writeCardPostFailed(store, "card-1", "Just added my 2024 Donruss Downtown Tyrese Maxey");
    assert.equal(cardPostFailed(store, "card-1"), "Just added my 2024 Donruss Downtown Tyrese Maxey");
    assert.equal(cardPostFailed(store, "card-2"), null);
    recordCardPost(store, "card-1", "post-1");
    assert.equal(cardPostFailed(store, "card-1"), null);
    writeCardPostFailed(store, "card-3", "");
    assert.equal(cardPostFailed(store, "card-3"), "", "an empty caption still marks the failure");
    clearCardPostFailed(store, "card-3");
    assert.equal(cardPostFailed(store, "card-3"), null);
  });

  it("survives bad storage values", () => {
    const store = memoryStore();
    store.setItem("slabhold.card-posts", "{nope");
    assert.equal(cardPostId(store, "card-1"), null);
    store.setItem("slabhold.card-posts", JSON.stringify(["card-1"]));
    assert.equal(cardPostId(store, "card-1"), null);
  });
});

describe("Post it: the composer with the card attached", () => {
  it("opens /compose?card=:id", () => {
    assert.equal(composeWithCardPath("card 1"), "/compose?card=card%201");
  });

  it("hands the composer a starter caption once, for that card only", () => {
    const store = memoryStore();
    writeComposeCaption(store, "card-1", "Just added my 2024 Donruss Downtown Tyrese Maxey");
    assert.equal(takeComposeCaption(store, "card-2"), null);
    assert.equal(takeComposeCaption(store, "card-1"), "Just added my 2024 Donruss Downtown Tyrese Maxey");
    assert.equal(takeComposeCaption(store, "card-1"), null);
    writeComposeCaption(store, "card-1", "   ");
    assert.equal(takeComposeCaption(store, "card-1"), null);
  });
});
