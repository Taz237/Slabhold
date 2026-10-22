import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { signupPath } from "@/lib/auth/safe-next";
import { CardPeopleView } from "@/components/card-people-view";
import {
  CardMessagePreviewBody,
  OpenToOffersBadge,
  OpenToOffersFilter,
  OpenToOffersToggle,
  ProfileCardCaption,
  WantAlertOfferLink,
} from "@/components/open-to-offers";
import type { CardPerson } from "@/lib/cards/people";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { saveUserCard } from "@/lib/social/cards";
import { localSendMessage, type LocalDb } from "@/lib/social/local-db";
import type { SportsCard } from "@/lib/types";
import { notifyWantMatches, type WantAlertDb, type WantRow } from "@/lib/wants/notify-want-matches";
import {
  filterOpenToOffers,
  inboxLastMessage,
  loadMessageRows,
  mapDirectMessage,
  messageOwnerHref,
  messageOwnerThreadHref,
  offerCardForThread,
  offerEstimateLabel,
  offerSendError,
  offersColumnMissing,
  openToOffersFilterAvailable,
  OWNER_OPEN_TO_OFFERS,
  parseCardPreview,
  publicTogglePatch,
  readOpenToOffers,
  resetMessageListColumnProbe,
  resolveLiveCardPreview,
  SENT_A_CARD,
  showOpenToOffersBadge,
  showOpenToOffersToggle,
  withOpenToOffersColumn,
} from "./open-to-offers";

const CARD = "card-1";
const OWNER = "owner-1";
const VIEWER = "viewer-1";

function person(partial: Partial<CardPerson> = {}): CardPerson {
  return {
    handle: "ada",
    displayName: "Ada",
    avatarUrl: null,
    isFollowedByViewer: false,
    openToOffers: false,
    ...partial,
  };
}

function card(partial: Partial<SportsCard> = {}): SportsCard {
  return {
    id: CARD,
    playerName: "Jordan Love",
    year: 2020,
    yearLabel: "2020",
    setBrand: "Select",
    setIsCustom: false,
    cardNumber: "47",
    noNumber: false,
    grade: "PSA 10",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "graded",
    gradeQualifier: "",
    certNumber: "",
    sport: "Football",
    purchasePrice: 20,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 40,
    sellPrice: null,
    sellDate: null,
    notes: "secret note",
    photoDataUrl: "https://cdn.example/card.jpg",
    accent: "#7c5cff",
    category: "pc",
    isPublic: true,
    openToOffers: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    ...partial,
  };
}

describe("open to offers toggle", () => {
  it("stays hidden for a private card and for someone else's card", () => {
    assert.equal(
      showOpenToOffersToggle({
        isEdit: true,
        isOwner: true,
        isPublic: false,
        columnKnown: true,
      }),
      false,
    );
    assert.equal(
      showOpenToOffersToggle({
        isEdit: true,
        isOwner: false,
        isPublic: true,
        columnKnown: true,
      }),
      false,
    );
    assert.equal(
      showOpenToOffersToggle({
        isEdit: false,
        isOwner: true,
        isPublic: true,
        columnKnown: true,
      }),
      false,
    );
    assert.equal(
      showOpenToOffersToggle({
        isEdit: true,
        isOwner: true,
        isPublic: true,
        columnKnown: false,
      }),
      false,
    );
    assert.equal(
      showOpenToOffersToggle({
        isEdit: true,
        isOwner: true,
        isPublic: true,
        columnKnown: true,
      }),
      true,
    );
    assert.equal(readOpenToOffers({}), null);
    assert.equal(readOpenToOffers({ open_to_offers: false }), false);
    assert.equal(readOpenToOffers({ open_to_offers: true }), true);
    assert.deepEqual(publicTogglePatch({ openToOffers: true }, false), {
      isPublic: false,
      openToOffers: false,
    });
    assert.deepEqual(withOpenToOffersColumn({ id: CARD }, { isPublic: false, openToOffers: true }), {
      id: CARD,
      open_to_offers: false,
    });
    assert.equal("open_to_offers" in withOpenToOffersColumn({ id: CARD }, { openToOffers: null }), false);

    const hidden = renderToStaticMarkup(
      createElement(OpenToOffersToggle, {
        visible: false,
        checked: false,
        onChange: () => undefined,
      }),
    );
    assert.equal(hidden, "");
    const shown = renderToStaticMarkup(
      createElement(OpenToOffersToggle, {
        visible: true,
        checked: false,
        onChange: () => undefined,
      }),
    );
    assert.match(shown, /Open to offers/);
    assert.match(shown, /Let collectors message you about this card/);
    assert.doesNotMatch(shown, /checkout|fees/i);
    assert.match(shown, /type="checkbox"/);
    assert.doesNotMatch(shown, /checked/);
    assert.equal(offersColumnMissing({ code: "42703" }), true);
    assert.equal(offersColumnMissing({ code: "PGRST204" }), true);
    assert.equal(offersColumnMissing({ code: "42501", message: "open_to_offers" }), false);
    assert.equal(offersColumnMissing({ message: "column open_to_offers does not exist" }), false);

    const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    const page = readFileSync(join(process.cwd(), "components/public-card-view.tsx"), "utf8");
    assert.match(form, /showOpenToOffersToggle\(/);
    assert.match(form, /isOwner: true/);
    assert.doesNotMatch(page, /OpenToOffersToggle/);
  });

  it("omits the column on save until it exists, then writes the owner's value", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    let column = false;
    const supabase = {
      from(table: string) {
        assert.equal(table, "cards");
        return {
          upsert(row: Record<string, unknown>) {
            upserts.push(row);
            if ("open_to_offers" in row && !column) {
              return Promise.resolve({
                error: {
                  code: "PGRST204",
                  message: "Could not find the 'open_to_offers' column of 'cards' in the schema cache",
                },
              });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    await saveUserCard(supabase as never, OWNER, card({ openToOffers: null }), 5_000);
    assert.equal(upserts.some((row) => "open_to_offers" in row), false);

    upserts.length = 0;
    await saveUserCard(supabase as never, OWNER, card({ openToOffers: true, isPublic: true }), 5_000);
    assert.equal(upserts[0]?.open_to_offers, true);
    assert.equal(upserts.at(-1)?.open_to_offers, undefined);
    assert.equal(upserts.at(-1)?.is_public, true);

    column = true;
    upserts.length = 0;
    await saveUserCard(supabase as never, OWNER, card({ openToOffers: true, isPublic: false }), 5_000);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.open_to_offers, false);
  });
});

describe("open to offers badge and profile filter", () => {
  it("renders the badge on a profile tile and in Owners and Hunters", () => {
    assert.equal(showOpenToOffersBadge(null), false);
    assert.equal(showOpenToOffersBadge(false), false);
    assert.equal(showOpenToOffersBadge(true), true);

    const tile = renderToStaticMarkup(
      createElement(ProfileCardCaption, {
        card: { playerName: "Jordan Love", year: 2020, setBrand: "Select", openToOffers: true },
        valueLabel: "Est. $40.00",
      }),
    );
    assert.match(tile, /Open to offers/);
    assert.match(tile, /Jordan Love/);
    assert.match(tile, /2020 Select/);

    const quiet = renderToStaticMarkup(
      createElement(ProfileCardCaption, {
        card: { playerName: "Jordan Love", year: 2020, setBrand: "Select", openToOffers: null },
        valueLabel: "Not enough sales yet",
      }),
    );
    assert.doesNotMatch(quiet, /Open to offers/);

    const badge = renderToStaticMarkup(createElement(OpenToOffersBadge, {}));
    assert.match(badge, /Open to offers/);

    const html = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: {
          owners: {
            count: 1,
            people: [person({ openToOffers: true })],
          },
          hunters: { count: 1, people: [person({ handle: "ben", displayName: "Ben" })] },
        },
        signedIn: true,
        signupHref: "/signup",
      }),
    );
    assert.equal((html.match(/Open to offers/g) ?? []).length, 1);
    assert.match(html, /Owners \(1\)/);
    assert.match(html, /Hunters \(1\)/);
  });

  it("filters a profile collection and hides the control when the column is missing", () => {
    const cards = [
      { id: "open", openToOffers: true },
      { id: "shut", openToOffers: false },
      { id: "unknown", openToOffers: null },
    ];
    assert.deepEqual(
      filterOpenToOffers(cards, true).map((item) => item.id),
      ["open"],
    );
    assert.equal(filterOpenToOffers(cards, false).length, 3);
    assert.equal(openToOffersFilterAvailable([{ openToOffers: null }, { openToOffers: null }]), false);
    assert.equal(openToOffersFilterAvailable([{ openToOffers: false }]), true);

    const hidden = renderToStaticMarkup(
      createElement(OpenToOffersFilter, { available: false, active: false, onToggle: () => undefined }),
    );
    assert.equal(hidden, "");
    const shown = renderToStaticMarkup(
      createElement(OpenToOffersFilter, { available: true, active: true, onToggle: () => undefined }),
    );
    assert.match(shown, /Open to offers/);
    assert.match(shown, /aria-pressed="true"/);
  });
});

describe("message owner", () => {
  const base = {
    viewerId: VIEWER,
    ownerId: OWNER,
    ownerUsername: "ada",
    cardId: CARD,
    openToOffers: true as boolean | null,
    blocked: false,
    muted: false,
  };

  it("deep links a public card that is open to offers", () => {
    assert.equal(messageOwnerHref(base), messageOwnerThreadHref("ada", CARD));
    assert.equal(messageOwnerHref(base), "/messages/ada?card=card-1");
    const signedOut = messageOwnerHref({ ...base, viewerId: null });
    assert.equal(signedOut, signupPath("/messages/ada?card=card-1"));
    assert.match(signedOut ?? "", /\/signup\?next=/);

    const parsed = parseCardPreview({ cardId: CARD });
    assert.deepEqual(parsed, { cardId: CARD });
    const live = resolveLiveCardPreview(
      CARD,
      [
        {
          id: CARD,
          ownerId: OWNER,
          openToOffers: true,
          playerName: "Jordan Love",
          year: 2020,
          setBrand: "Select",
          photoDataUrl: "/photos/love.jpg",
        },
      ],
      [{ id: OWNER, username: "ada" }],
    );
    assert.equal(live?.href, "/u/ada/cards/card-1");
    assert.equal(offerEstimateLabel("Not enough sales yet"), "Not enough sales yet");
    assert.equal(offerEstimateLabel("$40.00"), "Est. $40.00");
    const html = renderToStaticMarkup(
      createElement(CardMessagePreviewBody, {
        card: live
          ? {
              href: live.href,
              imageUrl: live.imageUrl,
              player: live.player,
              year: live.year,
              set: live.set,
              estimateLabel: offerEstimateLabel("$40.00"),
            }
          : null,
      }),
    );
    assert.match(html, /Jordan Love/);
    assert.match(html, /2020 Select/);
    assert.match(html, /Est\. \$40\.00/);
    assert.match(html, /href="\/u\/ada\/cards\/card-1"/);
    assert.match(html, /\/photos\/love\.jpg/);

    const attached = offerCardForThread({
      cardId: CARD,
      partnerId: OWNER,
      viewerId: VIEWER,
      blocked: false,
      muted: false,
      cards: [
        {
          id: CARD,
          ownerId: OWNER,
          openToOffers: true,
          playerName: "Jordan Love",
          year: 2020,
          setBrand: "Select",
          photoDataUrl: null,
        },
      ],
    });
    assert.equal(attached?.id, CARD);
    assert.equal(
      offerCardForThread({
        cardId: CARD,
        partnerId: OWNER,
        viewerId: VIEWER,
        blocked: false,
        muted: false,
        cards: [
          {
            id: CARD,
            ownerId: OWNER,
            openToOffers: false,
            playerName: "Jordan Love",
            year: 2020,
            setBrand: "Select",
            photoDataUrl: null,
          },
        ],
      }),
      null,
    );
  });

  it("refuses a blocked collector and a message to yourself", () => {
    assert.equal(messageOwnerHref({ ...base, blocked: true }), null);
    assert.equal(messageOwnerHref({ ...base, muted: true }), null);
    assert.equal(messageOwnerHref({ ...base, viewerId: OWNER }), null);
    assert.equal(messageOwnerHref({ ...base, openToOffers: false }), null);
    assert.equal(messageOwnerHref({ ...base, openToOffers: null }), null);
    assert.equal(
      offerSendError({
        senderId: VIEWER,
        receiverId: OWNER,
        blocked: true,
        muted: false,
        preview: null,
      }),
      BLOCKED_INTERACTION,
    );
    const preview = parseCardPreview({ cardId: CARD });
    assert.equal(
      offerSendError({
        senderId: VIEWER,
        receiverId: OWNER,
        blocked: false,
        muted: true,
        preview,
      }),
      BLOCKED_INTERACTION,
    );
    assert.equal(
      offerSendError({
        senderId: OWNER,
        receiverId: OWNER,
        blocked: false,
        muted: false,
        preview,
      }),
      "You can't message yourself.",
    );
    assert.equal(
      offerCardForThread({
        cardId: CARD,
        partnerId: OWNER,
        viewerId: OWNER,
        blocked: false,
        muted: false,
        cards: [
          {
            id: CARD,
            ownerId: OWNER,
            openToOffers: true,
            playerName: "Jordan Love",
            year: 2020,
            setBrand: "Select",
            photoDataUrl: null,
          },
        ],
      }),
      null,
    );
  });
});

describe("stored card preview", () => {
  const liveCards = [
    {
      id: CARD,
      ownerId: OWNER,
      openToOffers: true,
      playerName: "Jordan Love",
      year: 2020,
      setBrand: "Select",
      photoDataUrl: null,
    },
  ];
  const profiles = [{ id: OWNER, username: "ada" }];

  function htmlFor(stored: Record<string, unknown>) {
    const parsed = parseCardPreview(stored);
    assert.deepEqual(parsed, { cardId: CARD });
    const live = parsed ? resolveLiveCardPreview(parsed.cardId, liveCards, profiles) : null;
    return renderToStaticMarkup(
      createElement(CardMessagePreviewBody, {
        card: live
          ? {
              href: live.href,
              imageUrl: live.imageUrl,
              player: live.player,
              year: live.year,
              set: live.set,
              estimateLabel: "Est. $40.00",
            }
          : null,
      }),
    );
  }

  it("ignores a stored href, image, player, and estimate", () => {
    for (const href of ["/\\evil.com", "//evil.com", "javascript:alert(1)"]) {
      const html = htmlFor({
        cardId: CARD,
        href,
        imageUrl: "https://evil.example/stolen.jpg",
        player: "Spoofed Name",
        year: "1999",
        set: "Fake",
        estimateLabel: "Est. $1",
      });
      assert.match(html, /Jordan Love/);
      assert.match(html, /2020 Select/);
      assert.match(html, /Est\. \$40\.00/);
      assert.match(html, /href="\/u\/ada\/cards\/card-1"/);
      assert.doesNotMatch(html, /evil\.com|evil\.example|javascript:|Spoofed|Fake|1999|Est\. \$1/);
      assert.doesNotMatch(html, /<img/);
      assert.doesNotMatch(html, /href="\/\//);
      assert.doesNotMatch(html, /href="javascript/);
    }

    const gone = renderToStaticMarkup(
      createElement(CardMessagePreviewBody, {
        card: resolveLiveCardPreview(
          CARD,
          [{ ...liveCards[0], openToOffers: false }],
          profiles,
        )
          ? {
              href: "javascript:alert(1)",
              imageUrl: "https://evil.example/stolen.jpg",
              player: "Spoofed Name",
              year: "1999",
              set: "Fake",
              estimateLabel: "Est. $1",
            }
          : null,
      }),
    );
    assert.match(gone, /Card no longer available/);
    assert.doesNotMatch(gone, /href=|<img|evil|javascript|Spoofed/);

    const source = readFileSync(join(process.cwd(), "components/open-to-offers.tsx"), "utf8");
    const cardFn = source.slice(
      source.indexOf("export function CardMessagePreviewCard"),
      source.indexOf("export function WantAlertOfferLink"),
    );
    assert.match(cardFn, /useSocial\(/);
    assert.match(cardFn, /useCardValue\(/);
    assert.match(cardFn, /resolveLiveCardPreview\(/);
    assert.doesNotMatch(cardFn, /preview\.(href|imageUrl|player|year|set|estimateLabel)/);
    assert.doesNotMatch(cardFn, /<Link|<img/);
  });

  it("stores only the card id when a message is sent", () => {
    const dirty = {
      cardId: CARD,
      href: "//evil.com",
      imageUrl: "https://evil.example/stolen.jpg",
      player: "Spoofed Name",
      year: "1999",
      set: "Fake",
      estimateLabel: "Est. $1",
    };
    const mapped = mapDirectMessage({
      id: "m1",
      sender_id: VIEWER,
      receiver_id: OWNER,
      content: "offer",
      created_at: "2026-10-17T18:00:00.000Z",
      read: false,
      kind: "card_preview",
      card_preview: dirty,
    });
    assert.deepEqual(mapped.cardPreview, { cardId: CARD });

    const result = localSendMessage(
      {
        users: [{ id: VIEWER }, { id: OWNER }],
        sessionUserId: VIEWER,
        messages: [],
      } as unknown as LocalDb,
      OWNER,
      "Interested",
      dirty,
    );
    assert.equal(result.error, undefined);
    assert.deepEqual(result.db.messages[0]?.cardPreview, { cardId: CARD });
    assert.deepEqual(Object.keys(result.db.messages[0]?.cardPreview ?? {}), ["cardId"]);

    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    const thread = readFileSync(join(process.cwd(), "components/message-thread.tsx"), "utf8");
    assert.match(remote, /card_preview = \{ cardId: cardPreview\.cardId \}/);
    assert.match(remote, /loadMessageRows\(/);
    assert.doesNotMatch(remote, /from\("messages"\)\.select\("\*"\)/);
    assert.match(thread, /cardId: offerCard\.id/);
    assert.doesNotMatch(thread, /imageUrl:|estimateLabel:|href: `\/u\//);
  });
});

describe("want alert copy", () => {
  function want(): WantRow {
    return {
      id: "want-1",
      userId: VIEWER,
      cardKey: "jordan|2020|select|47|base|psa 10",
      targetPrice: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      sourceCardId: null,
    };
  }

  function db(rows: WantRow[]): WantAlertDb & { notes: { preview: string; metadata?: Record<string, unknown> | null }[] } {
    const notes: { preview: string; metadata?: Record<string, unknown> | null }[] = [];
    return {
      notes,
      async wantsForKey() {
        return rows;
      },
      async alertsToday() {
        return 0;
      },
      async insertAlert() {
        return true;
      },
      async insertNotification(row) {
        notes.push({ preview: row.preview, metadata: row.metadata });
        return { id: `note-${notes.length}`, createdAt: "2026-10-17T18:00:00.000Z" };
      },
      async actorCardAlerts() {
        return [];
      },
      async deleteNotification() {
        return undefined;
      },
      async deleteAlert() {
        return undefined;
      },
    };
  }

  it("says the owner is open to offers and links Message owner", async () => {
    const memory = db([want()]);
    const count = await notifyWantMatches(
      {
        sourceType: "listing",
        sourceId: CARD,
        cardKey: "jordan|2020|select|47|base|psa 10",
        cardId: CARD,
        actorId: OWNER,
        actorUsername: "ada",
        label: "Jordan Love PSA 10",
        href: "/u/ada/cards/card-1",
        openToOffers: true,
        now: new Date("2026-10-17T18:00:00.000Z"),
      },
      memory,
    );
    assert.equal(count, 1);
    assert.match(memory.notes[0]?.preview ?? "", /listed a Jordan Love PSA 10 you want/);
    assert.match(memory.notes[0]?.preview ?? "", new RegExp(OWNER_OPEN_TO_OFFERS));
    assert.equal(memory.notes[0]?.metadata?.open_to_offers, true);
    assert.equal(memory.notes[0]?.metadata?.message_owner_href, "/messages/ada?card=card-1");

    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement("span", null, memory.notes[0]?.preview),
        createElement(WantAlertOfferLink, { metadata: memory.notes[0]?.metadata }),
      ),
    );
    assert.match(html, new RegExp(OWNER_OPEN_TO_OFFERS));
    assert.match(html, /Message owner/);
    assert.match(html, /href="\/messages\/ada\?card=card-1"/);

    const closed = db([want()]);
    await notifyWantMatches(
      {
        sourceType: "listing",
        sourceId: "card-2",
        cardKey: "jordan|2020|select|47|base|psa 10",
        cardId: "card-2",
        actorId: OWNER,
        actorUsername: "ada",
        label: "Jordan Love PSA 10",
        href: "/u/ada/cards/card-2",
        openToOffers: false,
        now: new Date("2026-10-17T18:00:00.000Z"),
      },
      closed,
    );
    assert.doesNotMatch(closed.notes[0]?.preview ?? "", /Owner is open to offers/);
    assert.equal(closed.notes[0]?.metadata?.message_owner_href, undefined);

    const self = db([{ ...want(), userId: OWNER }]);
    const selfCount = await notifyWantMatches(
      {
        sourceType: "card",
        sourceId: CARD,
        cardKey: "jordan|2020|select|47|base|psa 10",
        cardId: CARD,
        actorId: OWNER,
        actorUsername: "ada",
        label: "Jordan Love PSA 10",
        href: "/u/ada/cards/card-1",
        openToOffers: true,
        now: new Date("2026-10-17T18:00:00.000Z"),
      },
      self,
    );
    assert.equal(selfCount, 0);
    assert.equal(self.notes.length, 0);
  });
});

describe("open to offers migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261022180000_open_to_offers.sql"),
    "utf8",
  );

  it("adds the boolean column and a card preview without applying itself", () => {
    assert.match(sql, /Donnie must approve/);
    assert.match(sql, /add column if not exists open_to_offers boolean/);
    assert.match(sql, /alter column open_to_offers set default false/);
    assert.match(sql, /alter column open_to_offers set not null/);
    assert.match(sql, /open_to_offers = false or is_public is true/);
    assert.match(sql, /auth\.uid\(\) = user_id/);
    assert.match(sql, /create or replace view public\.public_cards/);
    assert.match(sql, /open_to_offers/);
    assert.match(sql, /where is_public = true/);
    assert.match(sql, /^begin;$/m);
    assert.match(sql, /^commit;$/m);
    assert.match(sql, /cardId-only/);
    assert.match(sql, /jsonb_build_object\('cardId', card_preview->>'cardId'\)/);
    assert.match(sql, /pg_column_size\(card_preview\) <= 256/);
    assert.match(sql, /pc\.open_to_offers is true/);
    assert.match(sql, /kind in \('text', 'card_preview'\)/);
    assert.match(sql, /card_preview/);
    assert.match(sql, /private\.is_blocked/);
    assert.match(sql, /private\.is_muted/);
    assert.match(sql, /sender_id <> receiver_id/);
    assert.match(sql, /drop constraint if exists/);
    assert.match(sql, /drop policy if exists/);
    assert.match(sql, /drop trigger if exists/);
    assert.doesNotMatch(sql, /\bdrop table\b|\bdelete from\b|\btruncate public\b/i);
  });
});

describe("open to offers polish", () => {
  const upper = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
  const lower = upper.toLowerCase();

  it("shows Sent a card for a card-only inbox line", () => {
    const cardOnly = {
      content: "",
      kind: "card_preview" as const,
      cardPreview: { cardId: CARD },
    };
    assert.equal(inboxLastMessage(cardOnly), SENT_A_CARD);
    assert.equal(inboxLastMessage({ content: "   ", kind: "card", cardPreview: { cardId: CARD } }), SENT_A_CARD);
    assert.equal(inboxLastMessage({ content: "", cardPreview: { cardId: CARD } }), SENT_A_CARD);
    assert.equal(inboxLastMessage({ content: "On this one", kind: "card_preview", cardPreview: { cardId: CARD } }), "On this one");
    assert.equal(inboxLastMessage({ content: "hello" }), "hello");

    const html = renderToStaticMarkup(
      createElement("span", null, "You: ", inboxLastMessage(cardOnly)),
    );
    assert.match(html, /You: Sent a card/);
    assert.doesNotMatch(html, /You: <\/span>/);

    const view = readFileSync(join(process.cwd(), "components/messages-view.tsx"), "utf8");
    assert.match(view, /inboxLastMessage\(last\)/);
    assert.doesNotMatch(view, /\{last\.content\}/);
  });

  it("renders a card message after a cached missing-column check", async () => {
    resetMessageListColumnProbe();
    const missing = { code: "42703", message: "column card_preview does not exist" };
    const missed = await loadMessageRows(async (columns) => {
      if (columns.includes("card_preview")) return { data: [], error: missing };
      return { data: [{ id: "m1", content: "" }], error: null };
    });
    assert.equal(missed.error, null);

    const found = await loadMessageRows(async (columns) => {
      assert.match(columns, /card_preview/);
      return {
        data: [
          {
            id: "m1",
            sender_id: VIEWER,
            receiver_id: OWNER,
            content: "",
            created_at: "2026-10-22T00:00:00.000Z",
            read: false,
            kind: "card",
            card_preview: { cardId: upper, href: "//evil.com" },
          },
        ],
        error: null,
      };
    });
    const row = found.data[0];
    assert.ok(row);
    const message = mapDirectMessage(row);
    assert.equal(message.kind, "card_preview");
    assert.deepEqual(message.cardPreview, { cardId: lower });
    assert.equal(inboxLastMessage(message), SENT_A_CARD);

    const previewOnly = mapDirectMessage({
      id: "m2",
      sender_id: OWNER,
      receiver_id: VIEWER,
      content: "",
      created_at: "2026-10-22T00:00:00.000Z",
      read: false,
      card_preview: { cardId: upper },
    });
    assert.equal(previewOnly.kind, "card_preview");
    assert.equal(previewOnly.cardPreview?.cardId, lower);
    assert.equal(inboxLastMessage(previewOnly), SENT_A_CARD);
    resetMessageListColumnProbe();
  });

  it("lowercases a uuid before the shape check", () => {
    assert.deepEqual(parseCardPreview({ cardId: `  ${upper}  ` }), { cardId: lower });
    assert.match(lower, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.doesNotMatch(lower, /[A-F]/);
    assert.equal(parseCardPreview({ cardId: "ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ" }), null);
    assert.deepEqual(parseCardPreview({ cardId: CARD }), { cardId: CARD });
  });
});
