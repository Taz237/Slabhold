import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DealActionButtons } from "@/components/deal-actions";
import { dealErrorMessage } from "@/lib/deals/client";
import { catalogCardFromParams } from "@/lib/search/catalog-results";
import {
  ADD_TO_COLLECTION_LABEL,
  CONFIRM_DEAL_LABEL,
  DECLINE_DEAL_LABEL,
  MARK_SOLD_LABEL,
  addCardHref,
  confirmAllowed,
  confirmDealPreview,
  dealActions,
  dealCardLabel,
  dealForNotification,
  dealNotificationHref,
  dealRateAllows,
  dealsAfterCardRemoved,
  dmPartnerIds,
  heldCards,
  prefillFromMetadata,
  priceDollarsToCents,
  type Deal,
} from "./state";
import type { SportsCard } from "@/lib/types";

const SELLER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUYER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function deal(status: Deal["status"], patch: Partial<Deal> = {}): Deal {
  return {
    id: "deal-1",
    cardId: "card-1",
    sellerId: SELLER,
    buyerId: BUYER,
    kind: "sale",
    priceCents: 1250,
    status,
    cardPlayer: "Jordan Love",
    cardYear: "2020",
    cardSet: "Select",
    cardNumber: "47",
    cardParallel: "Base",
    createdAt: "2026-10-22T12:00:00.000Z",
    confirmedAt: status === "confirmed" ? "2026-10-22T13:00:00.000Z" : null,
    ...patch,
  };
}

function card(): SportsCard {
  return {
    id: "card-1",
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
    purchasePrice: 30,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 40,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

describe("deal actions", () => {
  it("lets only the buyer confirm or decline a pending deal", () => {
    const pending = deal("pending");
    assert.deepEqual(dealActions(pending, BUYER), {
      confirm: true,
      decline: true,
      cancel: false,
      addToCollection: false,
    });
    assert.deepEqual(dealActions(pending, SELLER), {
      confirm: false,
      decline: false,
      cancel: true,
      addToCollection: false,
    });
    assert.equal(dealActions(pending, "cccccccc-cccc-4ccc-8ccc-cccccccccccc").confirm, false);
    assert.equal(dealActions(deal("confirmed"), BUYER).addToCollection, true);
    assert.equal(dealActions(deal("confirmed"), BUYER).confirm, false);
    assert.equal(dealActions(deal("declined"), BUYER).decline, false);
    assert.equal(dealActions(deal("cancelled"), SELLER).cancel, false);
  });

  it("renders confirm, decline, and add to collection from those flags", () => {
    const pending = renderToStaticMarkup(
      createElement(DealActionButtons, {
        actions: dealActions(deal("pending"), BUYER),
      }),
    );
    assert.match(pending, new RegExp(CONFIRM_DEAL_LABEL));
    assert.match(pending, new RegExp(DECLINE_DEAL_LABEL));
    assert.doesNotMatch(pending, new RegExp(ADD_TO_COLLECTION_LABEL));

    const href = addCardHref({ player: "Jordan Love", year: "2020", set: "Select" });
    const confirmed = renderToStaticMarkup(
      createElement(DealActionButtons, {
        actions: dealActions(deal("confirmed"), BUYER),
        addHref: href,
      }),
    );
    assert.match(confirmed, new RegExp(ADD_TO_COLLECTION_LABEL));
    assert.match(confirmed, /href="\/cards\/new\?/);
    assert.doesNotMatch(confirmed, /marketplace/i);
  });

  it("prefills Add card and does not create one", () => {
    const href = addCardHref(
      prefillFromMetadata({
        player: "Jordan Love",
        year: "2020",
        set: "Select",
        num: "47",
        parallel: "Base",
        sport: "Football",
        rookie: false,
      }) ?? {},
    );
    const url = new URL(href, "https://slabhold.app");
    const catalog = catalogCardFromParams({
      pick: url.searchParams.get("pick") ?? "",
      player: url.searchParams.get("player") ?? "",
      year: url.searchParams.get("year") ?? "",
      set: url.searchParams.get("set") ?? "",
      num: url.searchParams.get("num") ?? "",
      parallel: url.searchParams.get("parallel") ?? "",
      sport: url.searchParams.get("sport") ?? "",
    });
    assert.equal(catalog?.playerName, "Jordan Love");
    assert.equal(catalog?.setBrand, "Select");
    assert.equal(href.startsWith("/cards/new?"), true);
  });

  it("keeps the buyer list to existing DM partners", () => {
    assert.deepEqual(
      dmPartnerIds(
        [
          { senderId: SELLER, receiverId: BUYER },
          { senderId: SELLER, receiverId: SELLER },
          { senderId: "other", receiverId: "else" },
        ],
        SELLER,
      ),
      [BUYER],
    );
  });

  it("accepts a blank price and rejects a negative one", () => {
    assert.equal(priceDollarsToCents("  "), null);
    assert.equal(priceDollarsToCents("12.50"), 1250);
    assert.equal(priceDollarsToCents("0"), 0);
    assert.equal(priceDollarsToCents("1000000"), 100_000_000);
    assert.equal(priceDollarsToCents("1000000.00"), 100_000_000);
    assert.equal(priceDollarsToCents("-1"), "invalid");
    assert.equal(priceDollarsToCents("1.234"), "invalid");
    assert.equal(priceDollarsToCents("1000000.01"), "invalid");
    assert.equal(
      dealErrorMessage({ code: "23514", message: "deals_price_cents" }),
      "Enter a price up to $1,000,000.",
    );
  });

  it("keeps a confirmed deal's name after the card is deleted and cancels a pending one", () => {
    const pending = deal("pending", { id: "pending-card", cardId: "card-1" });
    const confirmed = deal("confirmed", { id: "kept", cardId: "card-1" });
    const other = deal("confirmed", { id: "other", cardId: "card-2", cardPlayer: "Other" });
    const next = dealsAfterCardRemoved([pending, confirmed, other], "card-1");
    assert.equal(next[0]?.status, "cancelled");
    assert.equal(next[0]?.cardId, null);
    assert.equal(dealCardLabel(next[0]!), "Jordan Love · 2020 · Select · 47");
    assert.equal(next[1]?.status, "confirmed");
    assert.equal(next[1]?.cardId, null);
    assert.equal(dealCardLabel(next[1]!), "Jordan Love · 2020 · Select · 47");
    assert.equal(next[2]?.cardId, "card-2");
  });

  it("resolves the notification from the current username", () => {
    assert.equal(
      dealNotificationHref(SELLER, "love-new", "/messages/love-old"),
      "/messages/love-new",
    );
    assert.equal(dealNotificationHref(SELLER, null, "/messages/love-old"), "/messages/love-old");
    assert.equal(dealNotificationHref(null, null, "https://example.test"), "/notifications");
  });

  it("shares one deal list across notification rows", () => {
    const rows = [deal("pending", { id: "d1" }), deal("confirmed", { id: "d2" })];
    assert.equal(dealForNotification({ deal_id: "d1" }, rows)?.id, "d1");
    assert.equal(dealForNotification({ deal_id: "d2" }, rows)?.status, "confirmed");
    assert.equal(dealForNotification({ deal_id: "missing" }, rows), null);
  });

  it("allows five deals in an hour and stops the sixth", () => {
    assert.equal(dealRateAllows(4), true);
    assert.equal(dealRateAllows(5), false);
    assert.equal(
      dealErrorMessage({ code: "42501", message: "too many deals" }),
      "You can send 5 deals to the same person each hour.",
    );
  });

  it("blocks confirm and still explains a hand-recorded sale", () => {
    assert.equal(confirmAllowed(true), false);
    assert.equal(confirmAllowed(false), true);
    assert.equal(dealErrorMessage({ code: "42501", message: "not allowed" }), "You can't do that.");
    assert.equal(
      dealErrorMessage({ code: "42501", message: "already sold" }),
      "This card was already marked sold.",
    );
  });

  it("asks the buyer to confirm the card and never says marketplace", () => {
    assert.equal(confirmDealPreview("Jordan Love"), "Confirm deal for Jordan Love?");
    assert.equal(confirmDealPreview("  "), "Confirm deal for this card?");
    const source = readFileSync(join(process.cwd(), "lib/deals/state.ts"), "utf8");
    const sheet = readFileSync(join(process.cwd(), "components/deal-sheet.tsx"), "utf8");
    const cardPage = readFileSync(join(process.cwd(), "components/card-detail.tsx"), "utf8");
    const thread = readFileSync(join(process.cwd(), "components/message-thread.tsx"), "utf8");
    assert.equal(MARK_SOLD_LABEL, "Mark as sold/traded");
    assert.match(cardPage, /MARK_SOLD_LABEL/);
    assert.match(cardPage, /min-h-11[\s\S]*Mark as sold/);
    assert.match(thread, /min-h-11[\s\S]*MARK_SOLD_LABEL/);
    assert.match(thread, /DealThreadPanel/);
    for (const text of [source, sheet, cardPage, thread]) {
      assert.equal(/marketplace/i.test(text), false);
    }
    assert.equal(heldCards([card(), { ...card(), id: "sold", soldAt: "2026-10-22T00:00:00.000Z" }]).length, 1);
  });
});
