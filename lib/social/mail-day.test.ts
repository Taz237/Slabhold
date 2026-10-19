import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  MAIL_DAY_PHOTOS_TOO_LARGE,
  MAIL_DAY_POST_FAILED,
  assembleMailDayCards,
  loadMailDayPaid,
  loadMailDayViews,
  mailDayCardHref,
  mailDayCardRecord,
  mailDayMeta,
  mailDayPaidAmount,
  mailDayPhotoOwnedBy,
  mailDaySubmitBlocker,
  mailDaySubmitError,
  mailDayVisibility,
  parseAcquiredSource,
  presentMailDay,
  previewMailDayPost,
  runMailDaySave,
  validateMailDayDraft,
  type MailDayDraftCard,
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

  it("never writes paid or public into meta", () => {
    const meta = mailDayMeta({
      acquiredAt: "2026-10-19",
      cards: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          photos: ["https://example.com/a.jpg", ""],
          source: "card_show",
          showPaid: true,
          playerName: "A",
          year: 2024,
          yearLabel: "2024",
          setBrand: "Panini Prizm",
          cardNumber: "1",
          sport: "Baseball",
          parallel: "Base",
          grade: "Raw",
          conditionType: "raw",
        },
      ],
    });
    assert.equal("paid" in meta, false);
    assert.equal("public" in meta, false);
    assert.equal(meta.source, "card_show");
    assert.deepEqual(meta.photos, ["https://example.com/a.jpg"]);
    assert.equal(meta.acquiredAt, "2026-10-19");
    const cards = meta.cards as Record<string, unknown>[];
    assert.equal("paid" in cards[0], false);
    assert.equal("public" in cards[0], false);
    assert.equal(cards[0].sport, "Baseball");
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
    const cardId = "22222222-2222-4222-8222-222222222222";
    const paid = await loadMailDayPaid(
      {
        rpc: async (_name: string, args: { p_post_ids: string[] }) => {
          assert.deepEqual(args.p_post_ids, [id]);
          return { data: [{ post_id: id, card_id: cardId, paid: "12.50" }], error: null };
        },
      } as never,
      [id, "not-a-card"],
    );
    assert.equal(paid.get(id)?.get(cardId), 12.5);
  });

  it("keeps the post when the paid rpc errors", async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    const id = "11111111-1111-4111-8111-111111111111";
    try {
      const paid = await loadMailDayPaid(
        {
          rpc: async () => ({ data: null, error: { message: "paid down" } }),
        } as never,
        [id],
      );
      assert.equal(paid.size, 0);
      const views = assembleMailDayCards({
        postType: "mail_day",
        showPaid: true,
        meta: {
          source: "ebay",
          photos: ["https://example.com/a.jpg"],
          cards: [
            {
              id,
              photos: ["https://example.com/a.jpg"],
              source: "ebay",
              showPaid: true,
              playerName: "Victor Wembanyama",
              year: 2024,
              yearLabel: "2024",
              setBrand: "Panini Prizm",
              cardNumber: "136",
              sport: "Basketball",
              parallel: "Base",
              grade: "Raw",
              conditionType: "raw",
            },
          ],
        },
        authorId: "owner",
        viewerId: "other",
        legacyCard: null,
        linked: [{ cardId: id, position: 0 }],
        publicIds: new Set([id]),
        paidByCard: paid.get(id) ?? new Map(),
      });
      assert.equal(views.length, 1);
      assert.equal(views[0]?.paid, null);
      assert.equal(views[0]?.showValue, true);
      assert.match(String(warnings[0]?.[0]), /paid/);
    } finally {
      console.warn = original;
    }
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
  it("keeps the cards when the post fails", async () => {
    const result = await runMailDaySave({
      saveCards: async () => ({ ok: true, cardIds: ["card-1", "card-2"] }),
      savePost: async () => ({ ok: false }),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.cardSaved, true);
    assert.deepEqual(result.cardIds, ["card-1", "card-2"]);
    assert.equal(result.error, MAIL_DAY_POST_FAILED);
  });

  it("does not report a saved card when the card insert fails", async () => {
    let posted = false;
    const result = await runMailDaySave({
      saveCards: async () => ({ ok: false, error: "Could not save that card." }),
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

function draft(partial: Partial<MailDayDraftCard> = {}): MailDayDraftCard {
  return {
    playerName: "Victor Wembanyama",
    yearLabel: "2024",
    setBrand: "Panini Prizm",
    setIsCustom: false,
    cardNumber: "136",
    parallel: "Base",
    parallelIsCustom: false,
    sport: "Basketball",
    conditionType: "raw",
    grader: "PSA",
    grade: "10",
    paid: "40",
    source: "ebay",
    category: "flipping",
    isPublic: true,
    showPaid: true,
    photos: ["data:image/jpeg;base64,abc"],
    ...partial,
  };
}

describe("mail day form rules", () => {
  it("keeps Log Mail Day disabled until every card has a photo", () => {
    const reason = mailDaySubmitBlocker([
      draft(),
      draft({ photos: [], playerName: "Card Two", sport: "Baseball" }),
    ]);
    assert.equal(reason, "Add a photo for card 2");
    assert.equal(mailDaySubmitBlocker([draft({ photos: [] })]), "Add a photo for card 1");
    assert.equal(mailDaySubmitBlocker([draft(), draft({ sport: "Baseball" })]), null);
  });

  it("does not link a private card name", () => {
    assert.equal(
      mailDayCardHref({
        showValue: false,
        cardId: "card-private",
        viewerIsOwner: false,
        username: "ada",
      }),
      null,
    );
    assert.equal(
      mailDayCardHref({
        showValue: true,
        cardId: "card-public",
        viewerIsOwner: false,
        username: "ada",
      }),
      "/u/ada/cards/card-public",
    );
  });

  it("saves sport on each card and does not default it", () => {
    const prepared = validateMailDayDraft({
      caption: "",
      acquiredAt: "2026-10-19",
      cards: [draft({ sport: "Baseball" }), draft({ sport: "Hockey", playerName: "Connor" })],
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const rows = prepared.cards.map((card, index) =>
      mailDayCardRecord("user", { ...card, id: `card-${index}` }, "2026-10-19", "2026-10-19T00:00:00.000Z"),
    );
    assert.deepEqual(
      rows.map((row) => row.sport),
      ["Baseball", "Hockey"],
    );
    assert.equal(validateMailDayDraft({ caption: "", acquiredAt: "2026-10-19", cards: [draft({ sport: "" })] }).ok, false);
  });
});

describe("mail day multi-card privacy", () => {
  const publicId = "11111111-1111-4111-8111-111111111111";
  const privateId = "22222222-2222-4222-8222-222222222222";

  it("ignores meta.public and drops paid for a private card", () => {
    const views = assembleMailDayCards({
      postType: "mail_day",
      showPaid: true,
      meta: {
        public: true,
        paid: 77.77,
        cards: [
          {
            id: publicId,
            photos: ["https://example.com/a.jpg"],
            source: "ebay",
            showPaid: true,
            public: true,
            paid: 12,
            playerName: "Public Player",
            year: 2024,
            yearLabel: "2024",
            setBrand: "Panini Prizm",
            cardNumber: "1",
            sport: "Basketball",
            parallel: "Base",
            grade: "Raw",
            conditionType: "raw",
          },
          {
            id: privateId,
            photos: ["https://example.com/b.jpg"],
            source: "ebay",
            showPaid: true,
            public: true,
            paid: 77.77,
            playerName: "Private Player",
            year: 2024,
            yearLabel: "2024",
            setBrand: "Topps Chrome",
            cardNumber: "2",
            sport: "Baseball",
            parallel: "Refractor",
            grade: "Raw",
            conditionType: "raw",
          },
        ],
      },
      authorId: "owner",
      viewerId: null,
      legacyCard: null,
      linked: [
        { cardId: publicId, position: 0 },
        { cardId: privateId, position: 1 },
      ],
      publicIds: new Set([publicId]),
      paidByCard: new Map([
        [publicId, 12.25],
        [privateId, 77.77],
      ]),
    });
    assert.equal(views[0]?.showValue, true);
    assert.equal(views[0]?.paid, 12.25);
    assert.equal(views[1]?.showValue, false);
    assert.equal(views[1]?.paid, null);
    assert.equal(views[1]?.card.estimatedSellPrice, 0);
    assert.equal(JSON.stringify(views[1]).includes("77.77"), false);
  });

  it("hides paid in a logged-out anon response for the private card", async () => {
    const postId = "33333333-3333-4333-8333-333333333333";
    const privatePaid = 77.77;
    const urls: string[] = [];
    const rpcBody = [{ post_id: postId, card_id: publicId, paid: 12.25 }];
    const postCardsBody = [
      { post_id: postId, card_id: publicId, position: 0 },
      { post_id: postId, card_id: privateId, position: 1 },
    ];
    const client = createClient("https://example.supabase.co", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          urls.push(url);
          const body = url.includes("/rpc/mail_day_paid")
            ? rpcBody
            : url.includes("/post_cards")
              ? postCardsBody
              : url.includes("/public_cards")
                ? [{ id: publicId }]
                : [];
          return Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        },
      },
    });
    const meta = mailDayMeta({
      acquiredAt: "2026-10-19",
      cards: [
        {
          id: publicId,
          photos: ["https://cdn.example/a.jpg"],
          source: "ebay",
          showPaid: true,
          playerName: "Public Player",
          year: 2024,
          yearLabel: "2024",
          setBrand: "Panini Prizm",
          cardNumber: "1",
          sport: "Basketball",
          parallel: "Base",
          grade: "Raw",
          conditionType: "raw",
        },
        {
          id: privateId,
          photos: ["https://cdn.example/b.jpg"],
          source: "lcs",
          showPaid: true,
          playerName: "Private Player",
          year: 2024,
          yearLabel: "2024",
          setBrand: "Topps Chrome",
          cardNumber: "2",
          sport: "Baseball",
          parallel: "Refractor",
          grade: "Raw",
          conditionType: "raw",
        },
      ],
    });
    assert.equal(JSON.stringify(meta).includes(String(privatePaid)), false);
    assert.equal(JSON.stringify(postCardsBody).includes(String(privatePaid)), false);
    assert.equal(JSON.stringify(rpcBody).includes(String(privatePaid)), false);
    const views = await loadMailDayViews(
      client,
      [
        {
          id: postId,
          user_id: "owner",
          post_type: "mail_day",
          show_paid: true,
          meta,
          card: null,
        },
      ],
      null,
    );
    const cards = views.get(postId) ?? [];
    assert.equal(cards[0]?.paid, 12.25);
    assert.equal(cards[0]?.showValue, true);
    assert.equal(cards[1]?.paid, null);
    assert.equal(cards[1]?.showValue, false);
    assert.equal(cards[1]?.card.playerName, "Private Player");
    assert.equal(
      urls.some((url) => /\/rest\/v1\/cards(\?|$)/.test(url)),
      false,
    );
  });

  it("shows others paid only when the card is public and show paid is on", () => {
    const post = previewMailDayPost({
      authorId: "owner",
      caption: "",
      cards: [
        draft({ isPublic: false, showPaid: true, paid: "77.77", playerName: "Hidden" }),
        draft({ isPublic: true, showPaid: false, paid: "10", playerName: "Quiet" }),
        draft({ isPublic: true, showPaid: true, paid: "12.25", playerName: "Shown" }),
      ],
    });
    assert.equal(post.mailDayCards?.[0]?.paid, null);
    assert.equal(post.mailDayCards?.[0]?.showValue, false);
    assert.equal(post.mailDayCards?.[1]?.paid, null);
    assert.equal(post.mailDayCards?.[1]?.showValue, true);
    assert.equal(post.mailDayCards?.[2]?.paid, 12.25);
  });
});

describe("mail day multi-card migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261019240000_mail_day_multi_card.sql"),
    "utf8",
  );

  it("locks post_cards to the post author and the card owner", () => {
    assert.match(sql, /primary key \(post_id, card_id\)/);
    assert.match(sql, /unique \(post_id, position\)/);
    assert.match(sql, /post_cards_card_id_idx/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /p\.user_id = auth\.uid\(\)/);
    assert.match(sql, /c\.user_id = auth\.uid\(\)/);
    assert.match(sql, /private\.is_blocked\(auth\.uid\(\), p\.user_id\)/);
    assert.match(sql, /Mail Day posts must attach your own card/);
    assert.match(sql, /tg_op = 'UPDATE'/);
    assert.match(sql, /hidden_at/);
    assert.match(sql, /returns table \(post_id uuid, card_id uuid, paid numeric\)/);
    assert.match(sql, /join public\.public_cards pub on pub\.id = c\.id/);
  });
});

describe("mail day photo upload", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const file = "22222222-2222-4222-8222-222222222222.jpg";
  const photo = `https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/${userId}/${file}`;

  it("accepts ten stored photos and only the owner's folder", () => {
    const cards = Array.from({ length: 10 }, (_, index) =>
      draft({ playerName: `Player ${index + 1}`, photos: [photo] }),
    );
    const prepared = validateMailDayDraft({
      caption: "",
      acquiredAt: "2026-10-19",
      cards,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(prepared.cards.length, 10);
    assert.equal(prepared.cards.every((card) => card.photos[0] === photo), true);
    assert.equal(mailDayPhotoOwnedBy(photo, userId), true);
    assert.equal(
      mailDayPhotoOwnedBy(photo, "33333333-3333-4333-8333-333333333333"),
      false,
    );
    assert.equal(
      mailDayPhotoOwnedBy(photo.replace(userId, `${userId}/extra`), userId),
      false,
    );
    assert.equal(mailDayPhotoOwnedBy(`${photo.slice(0, -4)}.png`, userId), false);
  });

  it("shows the size message when the post throws, and the real error otherwise", () => {
    assert.equal(
      mailDaySubmitError(new Error("Body exceeded 1 MB limit.")),
      MAIL_DAY_PHOTOS_TOO_LARGE,
    );
    assert.equal(mailDaySubmitError(new Error("   ")), MAIL_DAY_PHOTOS_TOO_LARGE);
    assert.equal(
      mailDaySubmitError(new Error("Could not upload that photo.")),
      "Could not upload that photo.",
    );
  });

  it("uploads from the browser, then resets sending if the post throws", () => {
    const form = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    const actions = readFileSync(join(process.cwd(), "app/mail-day/actions.ts"), "utf8");
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261019250000_mail_day_own_photos.sql"),
      "utf8",
    );
    assert.equal(form.includes("_key"), false);
    assert.equal(form.includes("_open"), false);
    assert.equal(form.includes("_note"), false);
    assert.match(form, /uploadMedia\(/);
    assert.match(
      form,
      /try \{[\s\S]*uploadMailDayPhotos[\s\S]*createMailDayPost\([\s\S]*\} catch \(err\) \{[\s\S]*mailDaySubmitError\(err\)[\s\S]*\} finally \{[\s\S]*setSending\(false\)/,
    );
    assert.match(actions, /mailDayPhotoOwnedBy\(photo, userId\)/);
    assert.match(sql, /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
    assert.match(sql, /mail_day_photo_ok\(new\.image_url, new\.user_id\)/);
    assert.match(sql, /mail_day_photo_ok\(photo, new\.user_id\)/);
    assert.match(sql, /card-photos\/'/);
    assert.match(sql, /drop function if exists public\.mail_day_photo_ok\(text\)/);
  });
});
