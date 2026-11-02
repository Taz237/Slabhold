import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHARED_A_CARD, SHARED_A_POST, inboxPreviewText, messageLinks } from "./dm-inbox";

const CARD = "3b9e1f2a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";

describe("inbox preview for the owner's own card link", () => {
  it("reads Shared a card for /cards/<uuid> on our hosts", () => {
    assert.equal(inboxPreviewText(`https://slabhold.app/cards/${CARD}`), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`https://slabhold.app/cards/${CARD}/`), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`https://slabhold.app/cards/${CARD}?ref=share`), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`https://slabhold.app/cards/${CARD}#sales`), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`  HTTPS://SLABHOLD.APP/cards/${CARD.toUpperCase()}  `), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`www.slabhold.app/cards/${CARD}`), SHARED_A_CARD);
    assert.equal(inboxPreviewText(`https://slabhold.vercel.app/cards/${CARD}`), SHARED_A_CARD);
  });

  it("keeps the words around the link", () => {
    assert.equal(inboxPreviewText(`just graded https://slabhold.app/cards/${CARD} a 10`), "just graded a 10");
  });

  it("labels by the first shared link when there are several", () => {
    assert.equal(
      inboxPreviewText(`https://slabhold.app/cards/${CARD} https://slabhold.app/posts/abc`),
      SHARED_A_CARD,
    );
    assert.equal(
      inboxPreviewText(`https://slabhold.app/posts/abc https://slabhold.app/cards/${CARD}`),
      SHARED_A_POST,
    );
  });

  it("leaves other /cards paths and non-uuid ids raw", () => {
    for (const text of [
      `https://slabhold.app/cards/${CARD}/edit`,
      "https://slabhold.app/cards/not-a-uuid",
      "https://slabhold.app/cards",
    ]) {
      assert.equal(inboxPreviewText(text), text);
    }
  });

  it("keeps look-alike hosts raw", () => {
    for (const text of [
      `https://evilslabhold.app/cards/${CARD}`,
      `https://slabhold.app.evil.com/cards/${CARD}`,
      `https://notslabhold.app/cards/${CARD}`,
    ]) {
      assert.equal(inboxPreviewText(text), text);
    }
  });

  it("adds no rich preview for /cards/<uuid>", () => {
    assert.deepEqual(messageLinks(`https://slabhold.app/cards/${CARD}`), []);
    assert.deepEqual(messageLinks(`look https://slabhold.app/cards/${CARD}?ref=share`), []);
  });
});
