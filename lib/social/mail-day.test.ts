import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAIL_DAY_POST_FAILED,
  mailDayMeta,
  mailDayVisibility,
  parseAcquiredSource,
  runMailDaySave,
} from "./mail-day";

describe("mail day privacy", () => {
  it("hides value and paid when the card is private", () => {
    const owner = mailDayVisibility({
      isPublic: false,
      showPaid: true,
      viewerIsOwner: true,
      paid: 40,
    });
    const other = mailDayVisibility({
      isPublic: false,
      showPaid: true,
      viewerIsOwner: false,
      paid: 40,
    });
    assert.equal(owner.showValue, false);
    assert.equal(owner.paid, null);
    assert.equal(other.showValue, false);
    assert.equal(other.paid, null);
  });

  it("hides paid from non-owners when show_paid is off", () => {
    const view = mailDayVisibility({
      isPublic: true,
      showPaid: false,
      viewerIsOwner: false,
      paid: 40,
    });
    assert.equal(view.showValue, true);
    assert.equal(view.paid, null);
  });

  it("lets the owner see paid on a public card even when show_paid is off", () => {
    const view = mailDayVisibility({
      isPublic: true,
      showPaid: false,
      viewerIsOwner: true,
      paid: 40,
    });
    assert.equal(view.showValue, true);
    assert.equal(view.paid, 40);
  });

  it("shows paid to others only when show_paid is on", () => {
    const view = mailDayVisibility({
      isPublic: true,
      showPaid: true,
      viewerIsOwner: false,
      paid: 40,
    });
    assert.equal(view.paid, 40);
  });
});

describe("mail day source and meta", () => {
  it("accepts the source list and rejects anything else", () => {
    assert.equal(parseAcquiredSource("ebay"), "ebay");
    assert.equal(parseAcquiredSource("card_show"), "card_show");
    assert.equal(parseAcquiredSource("lcs"), "lcs");
    assert.equal(parseAcquiredSource("trade"), "trade");
    assert.equal(parseAcquiredSource("other"), "other");
    assert.equal(parseAcquiredSource("facebook"), null);
    assert.equal(parseAcquiredSource(""), null);
  });

  it("writes paid into meta only when the card is public and show_paid is on", () => {
    const hidden = mailDayMeta({
      source: "ebay",
      photos: ["https://example.com/a.jpg"],
      isPublic: true,
      showPaid: false,
      paid: 35,
      acquiredAt: "2026-10-19",
    });
    assert.equal("paid" in hidden, false);

    const privateCard = mailDayMeta({
      source: "lcs",
      photos: ["https://example.com/a.jpg"],
      isPublic: false,
      showPaid: true,
      paid: 35,
      acquiredAt: "2026-10-19",
    });
    assert.equal("paid" in privateCard, false);

    const shown = mailDayMeta({
      source: "card_show",
      photos: ["https://example.com/a.jpg"],
      isPublic: true,
      showPaid: true,
      paid: 35,
      acquiredAt: "2026-10-19",
    });
    assert.equal(shown.paid, 35);
    assert.equal(shown.source, "card_show");
  });
});

describe("mail day save", () => {
  it("keeps the card when the post fails", async () => {
    const result = await runMailDaySave({
      saveCard: async () => ({ ok: true, cardId: "card-1" }),
      savePost: async () => ({ ok: false }),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.cardSaved, true);
    assert.equal(result.cardId, "card-1");
    assert.equal(result.error, MAIL_DAY_POST_FAILED);
  });

  it("does not report a saved card when the card insert fails", async () => {
    let posted = false;
    const result = await runMailDaySave({
      saveCard: async () => ({ ok: false, error: "Could not save that card." }),
      savePost: async () => {
        posted = true;
        return { ok: true, postId: "post-1" };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.cardSaved, false);
    assert.equal(posted, false);
  });
});
