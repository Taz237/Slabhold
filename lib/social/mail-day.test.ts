import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isSaveTimeout, withSaveTimeout } from "@/lib/save/attempt";
import {
  MAIL_DAY_PHOTOS_TOO_LARGE,
  MAIL_DAY_POST_FAILED,
  assembleMailDayCards,
  commitMailDayWrites,
  isAlreadySaved,
  loadMailDayPaid,
  loadMailDayViews,
  mailDayCardHref,
  mailDayCardRecord,
  mailDayMeta,
  mailDayPaidAmount,
  mailDayPhotoOriginals,
  mailDayPhotoOwnedBy,
  mailDayPhotosToRemove,
  restoreRemovedMailDayPhotos,
  mailDaySubmitBlocker,
  mailDaySubmitError,
  mailDayVisibility,
  sportAfterCatalogPick,
  parseAcquiredSource,
  presentMailDay,
  previewMailDayPost,
  removeMailDayPhotos,
  runMailDaySave,
  uploadMailDayPhotosWith,
  validateMailDayDraft,
  type MailDayDraftCard,
  type MailDayPhotoUploader,
  type PreparedMailDayCard,
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
    isRookie: false,
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

  it("keeps a chosen sport when search returns a different sport", () => {
    assert.deepEqual(sportAfterCatalogPick("Football", "Baseball"), {
      sport: "Football",
      offer: "Baseball",
    });
    assert.deepEqual(sportAfterCatalogPick("", "Baseball"), {
      sport: "Baseball",
      offer: "",
    });
    const mailDayForm = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    const cardForm = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    assert.match(mailDayForm, /sportAfterCatalogPick\(section\.sport, card\.sport\)/);
    assert.match(cardForm, /sportAfterCatalogPick\(form\.sport,/);
    assert.match(mailDayForm, /This card is listed as/);
    assert.match(cardForm, /This card is listed as/);
    assert.match(mailDayForm, /RC \/ Rookie/);
  });

  it("saves isRookie on the card row and in mail day meta", () => {
    const prepared = validateMailDayDraft({
      caption: "",
      acquiredAt: "2026-10-19",
      cards: [
        draft({
          isRookie: true,
          setBrand: "Panini Donruss",
          parallel: "Optic Preview Pink Prizm",
        }),
      ],
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const card = prepared.cards[0];
    assert.equal(card.isRookie, true);
    const row = mailDayCardRecord(
      "user",
      card,
      "2026-10-19",
      "2026-10-19T00:00:00.000Z",
    );
    assert.equal(row.is_rookie, true);
    const meta = mailDayMeta({
      acquiredAt: "2026-10-19",
      cards: [
        {
          id: card.id,
          photos: card.photos,
          source: card.source,
          showPaid: card.showPaid,
          playerName: card.playerName,
          year: card.year,
          yearLabel: card.yearLabel,
          setBrand: card.setBrand,
          cardNumber: card.cardNumber,
          sport: card.sport,
          parallel: card.parallel,
          grade: card.gradeText,
          conditionType: card.conditionType,
          isRookie: card.isRookie,
        },
      ],
    });
    const saved = meta.cards as { isRookie: boolean }[];
    assert.equal(saved[0]?.isRookie, true);

    const fromTitle = validateMailDayDraft({
      caption: "",
      acquiredAt: "2026-10-19",
      cards: [draft({ isRookie: false, parallel: "Rated Rookie" })],
    });
    assert.equal(fromTitle.ok, true);
    if (!fromTitle.ok) return;
    assert.equal(fromTitle.cards[0]?.isRookie, true);
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
    assert.match(form, /uploadMailDayPhotosWith\(/);
    assert.match(
      form,
      /try \{[\s\S]*uploadMailDayPhotos[\s\S]*createMailDayPost\([\s\S]*\} catch \(err\) \{[\s\S]*mailDaySubmitError\(err\)[\s\S]*\} finally \{[\s\S]*setSending\(false\)/,
    );
    const catchBlock = form.slice(form.lastIndexOf("} catch (err) {"), form.indexOf("} finally {"));
    assert.match(catchBlock, /mailDaySubmitError\(err\)/);
    assert.doesNotMatch(catchBlock, /removeMailDayPhotos/);
    assert.match(
      form,
      /try \{\s*cards = await uploadMailDayPhotos\(user\.id, drafts, created\);\s*\} catch \(err\) \{\s*if \(isSaveTimeout\(err\)\) \{\s*setError\(SAVE_TIMEOUT_MESSAGE\);\s*return;\s*\}\s*await removeMailDayPhotos\(\s*createSupabaseBrowser\(\),\s*user\.id,\s*created\s*\);\s*setError\(mailDaySubmitError\(err\)\);\s*return;\s*\}/,
    );
    assert.match(actions, /mailDayPhotoOwnedBy\(photo, userId\)/);
    assert.match(sql, /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
    assert.match(sql, /mail_day_photo_ok\(new\.image_url, new\.user_id\)/);
    assert.match(sql, /mail_day_photo_ok\(photo, new\.user_id\)/);
    assert.match(sql, /card-photos\/'/);
    assert.match(sql, /drop function if exists public\.mail_day_photo_ok\(text\)/);
    assert.match(actions, /mailDayPhotosToRemove\(/);
    assert.match(form, /mailDayPhotosToRemove\(/);
    assert.match(actions, /removeMailDayPhotos\(/);
    assert.match(form, /removeMailDayPhotos\(/);
    assert.doesNotMatch(actions, /MAIL_DAY_POST_FAILED/);
    assert.doesNotMatch(form, /MAIL_DAY_POST_FAILED/);
  });

  async function saveMailDayClient(input: {
    cards: MailDayDraftCard[];
    uploader: MailDayPhotoUploader;
    server: (cards: MailDayDraftCard[]) => Promise<void>;
    remove: (urls: readonly string[]) => Promise<void>;
  }) {
    const created: string[] = [];
    const state = { sending: true, error: null as string | null };
    try {
      let cards: MailDayDraftCard[];
      try {
        cards = await uploadMailDayPhotosWith(input.uploader, input.cards, created);
      } catch (err) {
        await input.remove(created);
        state.error = mailDaySubmitError(err);
        return state;
      }
      await input.server(cards);
      return state;
    } catch (err) {
      state.error = mailDaySubmitError(err);
      return state;
    } finally {
      state.sending = false;
    }
  }

  function photoFileUrl(name: string) {
    return `https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/${userId}/${name}`;
  }

  it("deletes photos 1–2 when photo 3 fails to upload and never calls the server", async () => {
    const files = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.jpg",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3.jpg",
    ];
    const urls = files.map((name) => photoFileUrl(name));
    const removed: string[][] = [];
    let uploads = 0;
    let serverCalls = 0;
    const result = await saveMailDayClient({
      cards: [
        draft({
          photos: [
            "data:image/jpeg;base64,one",
            "data:image/jpeg;base64,two",
            "data:image/jpeg;base64,three",
          ],
        }),
      ],
      uploader: async () => {
        const index = uploads;
        uploads += 1;
        if (index === 2) return { url: null, error: "Could not upload that photo." };
        return { url: urls[index] ?? null };
      },
      server: async () => {
        serverCalls += 1;
      },
      remove: (uploaded) =>
        removeMailDayPhotos(
          {
            storage: {
              from(bucket: string) {
                assert.equal(bucket, "card-photos");
                return {
                  async remove(paths: string[]) {
                    removed.push(paths);
                    return { data: paths.map((name) => ({ name })), error: null };
                  },
                };
              },
            },
          },
          userId,
          uploaded,
        ),
    });
    assert.equal(uploads, 3);
    assert.equal(serverCalls, 0);
    assert.deepEqual(removed, [[`${userId}/${files[0]}`, `${userId}/${files[1]}`]]);
    assert.equal(result.error, "Could not upload that photo.");
    assert.equal(result.sending, false);
    const form = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    assert.match(form, /disabled=\{sending \|\| Boolean\(blocker\)\}/);
    assert.match(form, /\{error \? <p className="text-sm text-rose-600/);
    assert.match(form, /finally \{\s*setSending\(false\);\s*\}/);
    assert.match(
      form,
      /if \(isSaveTimeout\(err\)\) \{\s*setError\(SAVE_TIMEOUT_MESSAGE\);\s*return;\s*\}\s*await removeMailDayPhotos\(\s*createSupabaseBrowser\(\),\s*user\.id,\s*created\s*\);\s*setError\(mailDaySubmitError\(err\)\);\s*return;/,
    );
  });

  it("leaves photos in place when the server throws after cards are saved", async () => {
    const files = [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3.jpg",
    ];
    const urls = files.map((name) => photoFileUrl(name));
    let uploads = 0;
    let serverCalls = 0;
    let removeCalls = 0;
    let posted: string[] = [];
    const result = await saveMailDayClient({
      cards: [
        draft({
          photos: [
            "data:image/jpeg;base64,one",
            "data:image/jpeg;base64,two",
            "data:image/jpeg;base64,three",
          ],
        }),
      ],
      uploader: async () => {
        const url = urls[uploads] ?? null;
        uploads += 1;
        return { url };
      },
      server: async (cards) => {
        serverCalls += 1;
        posted = cards.flatMap((card) => card.photos);
        throw new Error("Could not reach Mail Day.");
      },
      remove: async () => {
        removeCalls += 1;
      },
    });
    assert.equal(uploads, 3);
    assert.equal(serverCalls, 1);
    assert.deepEqual(posted, urls);
    assert.equal(removeCalls, 0);
    assert.equal(result.error, "Could not reach Mail Day.");
    assert.equal(result.sending, false);
    const form = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    const outerCatch = form.slice(form.lastIndexOf("} catch (err) {"), form.indexOf("} finally {"));
    assert.match(outerCatch, /setError\(mailDaySubmitError\(err\)\)/);
    assert.doesNotMatch(outerCatch, /removeMailDayPhotos/);
    assert.match(form, /finally \{\s*setSending\(false\);\s*\}/);
    assert.match(form, /disabled=\{sending \|\| Boolean\(blocker\)\}/);
    assert.match(form, /\{error \? <p className="text-sm text-rose-600/);
  });

  it("keeps saved cards' photos and drops only unsaved uploads", () => {
    const saved = `${photo.replace(file, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg")}`;
    const unsaved = photo;
    const kept = mailDayPhotosToRemove(
      { cardSaved: true, error: MAIL_DAY_POST_FAILED, cardIds: ["card-1", "card-2"] },
      [
        { id: "card-1", photos: [saved] },
        { id: "card-2", photos: [unsaved] },
      ],
      [saved, unsaved],
    );
    assert.deepEqual(kept, []);
    const partial = mailDayPhotosToRemove(
      { cardSaved: true, error: "Could not save that card.", cardIds: ["card-1"] },
      [
        { id: "card-1", photos: [saved] },
        { id: "card-2", photos: [unsaved] },
      ],
      [saved, unsaved],
    );
    assert.deepEqual(partial, [unsaved]);
    const formPartial = mailDayPhotosToRemove(
      { cardSaved: true, error: "Could not save that card.", cardIds: ["card-1"] },
      [{ photos: [saved] }, { photos: [unsaved] }],
      [saved, unsaved],
    );
    assert.deepEqual(formPartial, [unsaved]);
    const shared = mailDayPhotosToRemove(
      { cardSaved: true, error: "Could not save that card.", cardIds: ["card-1"] },
      [
        { id: "card-1", photos: [saved] },
        { id: "card-2", photos: [saved, unsaved] },
      ],
      [saved, unsaved],
    );
    assert.deepEqual(shared, [unsaved]);
    const none = mailDayPhotosToRemove(
      { cardSaved: false, error: "Could not save that card.", cardIds: [] },
      [{ photos: [saved] }, { photos: [unsaved] }],
      [saved, unsaved],
    );
    assert.deepEqual(none, [saved, unsaved]);
    const retry = mailDayPhotosToRemove(
      { cardSaved: true, error: "Could not save that card.", cardIds: ["card-1"] },
      [
        { photos: [saved] },
        { photos: [unsaved] },
      ],
      [],
    );
    assert.deepEqual(retry, []);
  });

  it("deletes only this user's uploaded jpg when the post fails", async () => {
    const removed: string[][] = [];
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      await removeMailDayPhotos(
        {
          storage: {
            from(bucket: string) {
              assert.equal(bucket, "card-photos");
              return {
                async remove(paths: string[]) {
                  removed.push(paths);
                  return { data: paths.map((name) => ({ name })), error: null };
                },
              };
            },
          },
        },
        userId,
        [
          photo,
          photo,
          photo.replace(userId, "33333333-3333-4333-8333-333333333333"),
          "https://example.com/outside.jpg",
        ],
      );
    } finally {
      console.warn = original;
    }
    assert.deepEqual(removed, [[`${userId}/${file}`]]);
    assert.deepEqual(warnings, []);
  });

  it("logs when storage removes fewer files than asked", async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      await removeMailDayPhotos(
        {
          storage: {
            from() {
              return {
                async remove() {
                  return { data: [], error: null };
                },
              };
            },
          },
        },
        userId,
        [photo, photo],
      );
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /photo cleanup/);
    assert.match(String(warnings[0]?.[1]), /removed 0 of 1/);
  });
});

describe("photo storage privacy", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261019260000_photo_storage_privacy.sql"),
    "utf8",
  );

  it("drops public list rules, lets the owner delete card photos, and checks photoDataUrl", () => {
    assert.match(sql, /drop policy if exists "Public can view card photos"/);
    assert.match(sql, /drop policy if exists "Public can view avatars"/);
    assert.match(sql, /drop policy if exists "Public can view covers"/);
    assert.match(sql, /drop policy if exists "Public can view post images"/);
    assert.doesNotMatch(sql, /create policy "Public can view/);
    assert.doesNotMatch(sql, /set public = false/i);
    assert.match(sql, /Users can delete own card photos/);
    assert.match(sql, /on storage\.objects for delete/);
    assert.match(sql, /bucket_id = 'card-photos'/);
    assert.match(sql, /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
    assert.match(sql, /mail_day_photo_ok\(new\.card->>'photoDataUrl', new\.user_id\)/);
  });
});

describe("card photo owner read", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261019270000_card_photos_owner_read.sql"),
    "utf8",
  );

  it("lets a signed-in user read only their own card-photos folder", () => {
    assert.match(sql, /on storage\.objects for select/);
    assert.match(sql, /to authenticated/);
    assert.match(sql, /bucket_id = 'card-photos'/);
    assert.match(sql, /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
    assert.doesNotMatch(sql, /bucket_id = 'avatars'/);
    assert.doesNotMatch(sql, /bucket_id = 'covers'/);
    assert.doesNotMatch(sql, /bucket_id = 'post-images'/);
    assert.doesNotMatch(sql, /create policy "Public can view/);
    assert.doesNotMatch(sql, /set public = false/i);
  });
});

describe("mail day timeout retry", () => {
  it("lands one post after a timeout and a retry, and does not delete photos", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const cardId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const photo = `https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/${userId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
    const card: PreparedMailDayCard = {
      id: cardId,
      playerName: "Victor Wembanyama",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Prizm",
      setIsCustom: false,
      cardNumber: "136",
      parallel: "Base",
      parallelIsCustom: false,
      sport: "Basketball",
      conditionType: "raw",
      grader: null,
      gradeValue: "Raw",
      gradeText: "Raw",
      paid: 40,
      source: "ebay",
      category: "flipping",
      isPublic: true,
      showPaid: true,
      isRookie: false,
      photos: [photo],
    };
    const posts = new Map<string, Record<string, unknown>>();
    const cards = new Map<string, Record<string, unknown>>();
    const links: string[] = [];
    const removed: string[] = [];
    let release: () => void = () => undefined;
    let held = true;
    const writes = {
      async insertCard(row: { id: string }) {
        if (cards.has(row.id)) return { code: "23505", message: "duplicate key" };
        cards.set(row.id, row);
        return null;
      },
      async insertPost(row: Record<string, unknown>) {
        const id = String(row.id);
        if (posts.has(id)) return { code: "23505", message: "duplicate key" };
        if (held) {
          held = false;
          await new Promise<void>((resolve) => {
            release = () => {
              posts.set(id, row);
              resolve();
            };
          });
          return null;
        }
        posts.set(id, row);
        return null;
      },
      async insertLinks(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const key = `${row.post_id}:${row.card_id}`;
          if (links.includes(key)) return { code: "23505", message: "duplicate key" };
        }
        for (const row of rows) links.push(`${row.post_id}:${row.card_id}`);
        return null;
      },
      async deletePost(id: string) {
        posts.delete(id);
        removed.push(id);
      },
    };
    const input = {
      userId,
      postId,
      caption: "Mail day",
      acquiredAt: "2024-06-01",
      now: "2024-06-01T00:00:00.000Z",
      cards: [card],
      attachment: { id: cardId },
      showPaid: true,
      ...writes,
    };
    const first = await withSaveTimeout(() => commitMailDayWrites(input), 40).then(
      (value) => value,
      (error: unknown) => error,
    );
    assert.equal(isSaveTimeout(first), true);
    assert.equal(removed.length, 0);
    assert.equal(posts.size, 0);
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(posts.size, 1);
    assert.equal(cards.size, 1);
    assert.equal(cards.get(cardId)?.image_url, photo);
    assert.equal(removed.length, 0);
    const retry = await commitMailDayWrites(input);
    assert.equal(retry.ok, true);
    assert.equal(isAlreadySaved({ code: "23505" }), true);
    assert.equal(posts.size, 1);
    assert.equal(cards.size, 1);
    assert.equal(links.length, 1);
    assert.equal(removed.length, 0);
    assert.equal(cards.get(cardId)?.image_url, photo);
  });
});

describe("mail day failed save restores photos for retry", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  function stored(name: string) {
    return `https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/${userId}/${name}.jpg`;
  }

  function photoBin() {
    const removed: string[][] = [];
    return {
      removed,
      client: {
        storage: {
          from(bucket: string) {
            assert.equal(bucket, "card-photos");
            return {
              async remove(paths: string[]) {
                removed.push(paths);
                return { data: paths.map((name) => ({ name })), error: null };
              },
            };
          },
        },
      },
    };
  }

  type SaveResult =
    | { ok: true; cardIds: string[] }
    | { ok: false; cardSaved: false; error: string }
    | { ok: false; cardSaved: true; error: string; cardIds: string[] };

  async function submitPhotos(input: {
    sections: MailDayDraftCard[];
    uploader: MailDayPhotoUploader;
    createMailDayPost: (cards: MailDayDraftCard[]) => Promise<SaveResult>;
    bin: ReturnType<typeof photoBin>;
  }) {
    const created: string[] = [];
    const cards = await uploadMailDayPhotosWith(input.uploader, input.sections, created);
    const originals = mailDayPhotoOriginals(input.sections, cards);
    let sections = input.sections.map((section, index) =>
      cards[index] ? { ...section, photos: [...cards[index].photos] } : section,
    );
    const result = await input.createMailDayPost(cards);
    if (!result.ok) {
      const removed = mailDayPhotosToRemove(
        {
          cardSaved: result.cardSaved,
          error: result.error,
          cardIds: result.cardSaved ? result.cardIds : [],
        },
        cards,
        created,
      );
      await removeMailDayPhotos(input.bin.client, userId, removed);
      sections = restoreRemovedMailDayPhotos(sections, removed, originals);
      return { sections, saved: null };
    }
    return {
      sections,
      saved: {
        cards: cards.map((card) => card.photos),
        post: cards[0]?.photos[0] ?? null,
      },
    };
  }

  it("re-uploads every photo after cardSaved false, and the retry does not keep a deleted url", async () => {
    const one = "data:image/jpeg;base64,one";
    const two = "data:image/jpeg;base64,two";
    const names = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    ];
    const urls = names.map((name) => stored(name));
    const uploaded: string[] = [];
    let next = 0;
    const bin = photoBin();
    const uploader: MailDayPhotoUploader = async (photo) => {
      uploaded.push(photo);
      const url = urls[next] ?? null;
      next += 1;
      return { url };
    };
    let sections = [draft({ id: "card-1", photos: [one, two] })];
    const failed = await submitPhotos({
      sections,
      uploader,
      bin,
      createMailDayPost: async () => ({
        ok: false,
        cardSaved: false,
        error: "Could not save that card.",
      }),
    });
    assert.equal(failed.saved, null);
    assert.deepEqual(failed.sections[0]?.photos, [one, two]);
    assert.deepEqual(bin.removed, [[`${userId}/${names[0]}.jpg`, `${userId}/${names[1]}.jpg`]]);
    sections = failed.sections;
    const savedCards: string[][] = [];
    const savedPosts: Array<string | null> = [];
    const retried = await submitPhotos({
      sections,
      uploader,
      bin,
      createMailDayPost: async (cards) => {
        savedCards.push(...cards.map((card) => card.photos));
        savedPosts.push(cards[0]?.photos[0] ?? null);
        return { ok: true, cardIds: ["card-1"] };
      },
    });
    assert.deepEqual(uploaded, [one, two, one, two]);
    assert.deepEqual(savedCards, [[urls[2], urls[3]]]);
    assert.deepEqual(savedPosts, [urls[2]]);
    assert.deepEqual(retried.saved?.cards, [[urls[2], urls[3]]]);
    const deleted = new Set([urls[0], urls[1]]);
    assert.equal(
      [...savedCards.flat(), ...savedPosts].some((url) => url != null && deleted.has(url)),
      false,
    );
    assert.equal(bin.removed.length, 1);
  });

  it("keeps a saved card's url and re-uploads only the card that failed", async () => {
    const one = "data:image/jpeg;base64,one";
    const two = "data:image/jpeg;base64,two";
    const names = [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    ];
    const urls = names.map((name) => stored(name));
    const uploaded: string[] = [];
    let next = 0;
    const bin = photoBin();
    const uploader: MailDayPhotoUploader = async (photo) => {
      uploaded.push(photo);
      const url = urls[next] ?? null;
      next += 1;
      return { url };
    };
    const failed = await submitPhotos({
      sections: [
        draft({ id: "card-1", photos: [one] }),
        draft({ id: "card-2", playerName: "Card Two", photos: [two] }),
      ],
      uploader,
      bin,
      createMailDayPost: async () => ({
        ok: false,
        cardSaved: true,
        cardIds: ["card-1"],
        error: "Could not save that card.",
      }),
    });
    assert.deepEqual(failed.sections.map((section) => section.photos), [[urls[0]], [two]]);
    assert.deepEqual(bin.removed, [[`${userId}/${names[1]}.jpg`]]);
    const savedCards: string[][] = [];
    const savedPosts: Array<string | null> = [];
    await submitPhotos({
      sections: failed.sections,
      uploader,
      bin,
      createMailDayPost: async (cards) => {
        savedCards.push(...cards.map((card) => card.photos));
        savedPosts.push(cards[0]?.photos[0] ?? null);
        return { ok: true, cardIds: ["card-1", "card-2"] };
      },
    });
    assert.deepEqual(uploaded, [one, two, two]);
    assert.deepEqual(savedCards, [[urls[0]], [urls[2]]]);
    assert.deepEqual(savedPosts, [urls[0]]);
    assert.equal(savedCards.flat().includes(urls[1]), false);
    assert.equal(savedPosts.includes(urls[1]), false);
  });

  it("does not delete or put photos back when the post times out", () => {
    const form = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    const submitStart = form.indexOf("async function submit");
    const submit = form.slice(submitStart, form.indexOf("return (", submitStart));
    const postTimeout = submit.slice(submit.indexOf("if (!isSaveTimeout(err)) throw err;"));
    const beforeResult = postTimeout.slice(0, postTimeout.indexOf("if (!result.ok)"));
    assert.doesNotMatch(beforeResult, /removeMailDayPhotos/);
    assert.doesNotMatch(beforeResult, /restoreRemovedMailDayPhotos/);
    assert.match(
      submit,
      /const originals = mailDayPhotoOriginals\(drafts, cards\);[\s\S]*photos: cards\[index\]\.photos[\s\S]*if \(!result\.ok\) \{[\s\S]*const removed = mailDayPhotosToRemove\([\s\S]*await removeMailDayPhotos\(createSupabaseBrowser\(\), user\.id, removed\);[\s\S]*restoreRemovedMailDayPhotos\(current, removed, originals\)/,
    );
  });
});
