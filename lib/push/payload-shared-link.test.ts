import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { singlePayload, type PushActor } from "./payload";

const CARD = "3b9e1f2a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";
const POST = "6f9a1c3e-1111-4222-8333-944455556666";
const sender: PushActor = { id: "a1", displayName: "Slab Fan", username: "slabfan", avatarUrl: null };

function dm(text: string | null, extra: Partial<Parameters<typeof singlePayload>[0]> = {}) {
  return singlePayload({
    kind: "dm",
    actor: sender,
    postId: null,
    text,
    messageKind: "text",
    showPreviews: true,
    badge: 1,
    ts: 1_700_000_000_000,
    ...extra,
  });
}

describe("DM push body for a shared Slabhold link", () => {
  it("says Shared a card for a bare card link, both shapes", () => {
    assert.equal(dm(`https://slabhold.app/u/collector/cards/${CARD}`).body, "Shared a card");
    assert.equal(dm(`https://slabhold.app/u/collector/cards/${CARD}?ref=share`).body, "Shared a card");
    assert.equal(dm(`https://slabhold.app/cards/${CARD}`).body, "Shared a card");
  });

  it("says Shared a post for a bare post link", () => {
    assert.equal(dm(`https://slabhold.app/posts/${POST}`).body, "Shared a post");
  });

  it("keeps the words around a link", () => {
    assert.equal(dm(`look at this https://slabhold.app/u/collector/cards/${CARD}`).body, "look at this");
    assert.equal(dm(`thoughts? https://slabhold.app/posts/${POST} 🔥`).body, "thoughts? 🔥");
  });

  it("leaves plain text alone, still truncated", () => {
    assert.equal(dm("got it, thanks").body, "got it, thanks");
    assert.equal(dm("https://example.com/posts/abc").body, "https://example.com/posts/abc");
    const long = dm("a".repeat(200)).body;
    assert.equal(Array.from(long).length, 120);
    assert.ok(long.endsWith("…"));
    assert.equal(dm("   ").body, "Sent a message");
    assert.equal(dm(null).body, "Sent a message");
  });

  it("stays private when previews are off", () => {
    assert.equal(dm(`https://slabhold.app/cards/${CARD}`, { showPreviews: false }).body, "New message");
    assert.equal(dm("hey", { showPreviews: false }).body, "New message");
  });

  it("keeps Sent a card for a card_preview message", () => {
    assert.equal(dm(`https://slabhold.app/posts/${POST}`, { messageKind: "card_preview" }).body, "Sent a card");
    assert.equal(dm(null, { messageKind: "card_preview" }).body, "Sent a card");
  });
});
