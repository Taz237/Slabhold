import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAIL_DAY_POST_FAILED,
  loadMailDayPaid,
  mailDayMeta,
  mailDayPaidAmount,
  mailDayVisibility,
  parseAcquiredSource,
  presentMailDay,
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

  it("never writes paid into meta", () => {
    const meta = mailDayMeta({
      source: "card_show",
      photos: ["https://example.com/a.jpg", ""],
      isPublic: true,
      acquiredAt: "2026-10-19",
    });
    assert.equal("paid" in meta, false);
    assert.equal(meta.source, "card_show");
    assert.deepEqual(meta.photos, ["https://example.com/a.jpg"]);
    assert.equal(meta.public, true);
    assert.equal(meta.acquiredAt, "2026-10-19");
  });
});

describe("mail day paid comes from the card", () => {
  const meta = { paid: 99, source: "ebay", photos: ["https://example.com/a.jpg"] };

  it("ignores paid stored on meta", () => {
    const view = presentMailDay({
      postType: "mail_day",
      showPaid: true,
      meta,
      authorId: "owner",
      viewerId: "other",
      cardIsPublic: true,
      paid: null,
    });
    assert.equal(view?.paid, null);
    assert.equal(view?.showValue, true);
  });

  it("shows a supplied price to others only when the card is public and show_paid is on", () => {
    const hidden = presentMailDay({
      postType: "mail_day",
      showPaid: false,
      meta,
      authorId: "owner",
      viewerId: "other",
      cardIsPublic: true,
      paid: 40,
    });
    const shown = presentMailDay({
      postType: "mail_day",
      showPaid: true,
      meta,
      authorId: "owner",
      viewerId: "other",
      cardIsPublic: true,
      paid: "40.00" as unknown as number,
    });
    assert.equal(hidden?.paid, null);
    assert.equal(shown?.paid, 40);
  });

  it("lets the owner see a supplied price on a public card and hides it when private", () => {
    const owner = presentMailDay({
      postType: "mail_day",
      showPaid: false,
      meta,
      authorId: "owner",
      viewerId: "owner",
      cardIsPublic: true,
      paid: 40,
    });
    const privateCard = presentMailDay({
      postType: "mail_day",
      showPaid: true,
      meta,
      authorId: "owner",
      viewerId: "owner",
      cardIsPublic: false,
      paid: 40,
    });
    assert.equal(owner?.paid, 40);
    assert.equal(privateCard?.paid, null);
    assert.equal(privateCard?.showValue, false);
  });

  it("parses numeric strings and skips non-uuids when loading paid", async () => {
    assert.equal(mailDayPaidAmount("12.50"), 12.5);
    assert.equal(mailDayPaidAmount("nope"), null);
    const id = "11111111-1111-4111-8111-111111111111";
    const paid = await loadMailDayPaid(
      {
        rpc: async (_name: string, args: { p_post_ids: string[] }) => {
          assert.deepEqual(args.p_post_ids, [id]);
          return { data: [{ post_id: id, paid: "12.50" }], error: null };
        },
      } as never,
      [id, "not-a-card"],
    );
    assert.equal(paid.get(id), 12.5);
  });
});

describe("mail day paid migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261019203000_mail_day_paid_privacy.sql"),
    "utf8",
  );

  it("strips paid and only returns it for a public card", () => {
    assert.match(sql, /set meta = meta - 'paid'/);
    assert.match(sql, /new\.meta := new\.meta - 'paid'/);
    assert.match(sql, /join public\.public_cards pc on pc\.id = c\.id/);
    assert.match(sql, /p\.show_paid is true\s+or auth\.uid\(\) = p\.user_id/);
    assert.match(sql, /security definer/);
    assert.match(sql, /before insert or update on public\.posts/i);
    assert.match(sql, /user_id = new\.user_id/);
    assert.match(
      sql,
      /https:\/\/knuwflptobyutrauxblj\\.supabase\\.co\/storage\/v1\/object\/public/,
    );
    assert.match(sql, /when jsonb_typeof\(p\.meta\) = 'object' then p\.meta - 'paid'/);
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
