import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategorySwitch } from "@/components/card-page/category-switch";
import { CategoryPicker } from "@/components/category-picker";
import { cardCategory, categoryLabel } from "@/lib/card-category";
import { collectionFilterEmpty } from "@/lib/collection/lane-empty";
import {
  OPEN_TO_OFFERS_LABEL,
  categoryMovePatch,
  editFormPublicTurnsOffersOn,
  newCardOffersPatch,
  publicTogglePatch,
  withOpenToOffersColumn,
} from "@/lib/offers/open-to-offers";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("the pile is called Open to offers everywhere it shows", () => {
  it("names the pile with the badge's own words, and still stores flipping", () => {
    assert.equal(categoryLabel("flipping"), OPEN_TO_OFFERS_LABEL);
    assert.equal(categoryLabel("pc"), "Personal");
    // The saved value is unchanged, so no card's data changes.
    assert.equal(cardCategory({ category: "flipping" }), "flipping");
    assert.equal(cardCategory({ category: null }), "flipping");
    assert.equal(cardCategory({ category: "pc" }), "pc");
  });

  it("uses it on the Collection tabs, the Move action, the form's Category row and the empty state", () => {
    assert.match(read("components/dashboard.tsx"), /\{ id: "flipping", label: categoryLabel\("flipping"\) \}/);
    assert.match(read("components/collection-tile-actions.tsx"), /Move to \{categoryLabel\(other\)\}/);
    assert.match(read("components/card-form.tsx"), /<SheetRow label="Category" value=\{categoryLabel\(category\)\}>/);
    const empty = collectionFilterEmpty("flipping");
    assert.equal(empty.title, "No cards open to offers yet");
    assert.match(empty.detail, /Open to offers/);
  });

  it("shows no pile called Flipping or For sale in any picker", () => {
    const pickers = [
      renderToStaticMarkup(createElement(CategoryPicker, { value: "flipping", onChange: () => {} })),
      renderToStaticMarkup(createElement(CategorySwitch, { value: "flipping", onChange: () => {} })),
    ];
    for (const html of pickers) {
      assert.match(text(html), /Open to offers/);
      assert.doesNotMatch(text(html), /flip|for sale/i);
      // Screen readers hear the same words: no hidden label says otherwise.
      assert.doesNotMatch(html, /aria-label="[^"]*(flip|for sale)[^"]*"/i);
    }
  });

  it("leaves no Flipping in the words of the files that draw the pile", () => {
    for (const file of [
      "lib/card-category.ts",
      "lib/collection/lane-empty.ts",
      "components/collection-tile-actions.tsx",
      "components/category-picker.tsx",
      "components/dashboard.tsx",
      "app/(app)/privacy/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /Flipping/, file);
    }
  });
});

describe("the pile and the badge move together", () => {
  const publicCard = { category: "pc", isPublic: true, openToOffers: false };

  it("turns the badge on when a public card moves into Open to offers", () => {
    assert.deepEqual(categoryMovePatch(publicCard, "flipping"), { category: "flipping", openToOffers: true });
  });

  it("turns the badge off when a card moves out", () => {
    assert.deepEqual(categoryMovePatch({ category: "flipping", isPublic: true, openToOffers: true }, "pc"), {
      category: "pc",
      openToOffers: false,
    });
    // A card saved with no pile sits in Open to offers, so leaving it is a move out too.
    assert.deepEqual(categoryMovePatch({ category: null, isPublic: true, openToOffers: true }, "pc"), {
      category: "pc",
      openToOffers: false,
    });
  });

  it("leaves the owner's own switch alone when the pile does not change", () => {
    // Switched off by hand while in the pile: tapping the same pile again does not turn it back on.
    assert.deepEqual(categoryMovePatch({ category: "flipping", isPublic: true, openToOffers: false }, "flipping"), {
      category: "flipping",
    });
    // Switched on by hand while in Personal: staying in Personal does not turn it off.
    assert.deepEqual(categoryMovePatch({ category: "pc", isPublic: true, openToOffers: true }, "pc"), { category: "pc" });
  });

  it("never puts the badge on a private card", () => {
    assert.deepEqual(categoryMovePatch({ category: "pc", isPublic: false, openToOffers: false }, "flipping"), {
      category: "flipping",
      openToOffers: false,
    });
    // And the row that gets saved agrees.
    assert.equal(
      withOpenToOffersColumn({}, { isPublic: false, openToOffers: true }).open_to_offers,
      false,
    );
  });

  it("sends no flag when the column is not on the card", () => {
    assert.deepEqual(categoryMovePatch({ category: "pc", isPublic: true }, "flipping"), { category: "flipping" });
    assert.deepEqual(categoryMovePatch({ category: "pc", isPublic: true, openToOffers: null }, "flipping"), {
      category: "flipping",
    });
  });

  it("still clears the badge when a card goes private, as before", () => {
    assert.deepEqual(publicTogglePatch({ openToOffers: true }, false), { isPublic: false, openToOffers: false });
    assert.deepEqual(publicTogglePatch({ category: "flipping", openToOffers: true }, false), {
      isPublic: false,
      openToOffers: false,
    });
    assert.deepEqual(publicTogglePatch({ category: "pc", openToOffers: false }, false), {
      isPublic: false,
      openToOffers: false,
    });
  });

  it("turns the badge on when a private card in the Open to offers pile is made Public", () => {
    assert.deepEqual(publicTogglePatch({ category: "flipping", openToOffers: false }, true), {
      isPublic: true,
      openToOffers: true,
    });
    // A Personal card going Public is unchanged: no badge, and its own switch is left alone.
    assert.deepEqual(publicTogglePatch({ category: "pc", openToOffers: false }, true), { isPublic: true });
    assert.deepEqual(publicTogglePatch({ category: "pc", openToOffers: true }, true), { isPublic: true });
    // A card with no saved pile is not treated as a pick of Open to offers.
    assert.deepEqual(publicTogglePatch({ openToOffers: false }, true), { isPublic: true });
    assert.deepEqual(publicTogglePatch({ category: null, openToOffers: false }, true), { isPublic: true });
  });

  it("leaves the flag out of a Public toggle when the column is not on the card", () => {
    assert.deepEqual(publicTogglePatch({ category: "flipping" }, true), { isPublic: true });
    assert.deepEqual(publicTogglePatch({ category: "flipping", openToOffers: null }, true), { isPublic: true });
    assert.deepEqual(publicTogglePatch({ category: "flipping", openToOffers: null }, false), { isPublic: false });
  });

  it("gives a new Public card added to the Open to offers pile the badge", () => {
    assert.deepEqual(newCardOffersPatch({ category: "flipping", isPublic: true }), { openToOffers: true });
    // The row that gets saved carries it.
    assert.equal(
      withOpenToOffersColumn({}, { isPublic: true, ...newCardOffersPatch({ category: "flipping", isPublic: true }) })
        .open_to_offers,
      true,
    );
  });

  it("gives no badge to a new Personal card or a new private card in that pile", () => {
    assert.deepEqual(newCardOffersPatch({ category: "pc", isPublic: true }), {});
    assert.deepEqual(newCardOffersPatch({ category: "pc", isPublic: false }), {});
    assert.deepEqual(newCardOffersPatch({ category: "flipping", isPublic: false }), { openToOffers: false });
    assert.notEqual(
      withOpenToOffersColumn({}, { isPublic: false, ...newCardOffersPatch({ category: "flipping", isPublic: false }) })
        .open_to_offers,
      true,
    );
    assert.equal(
      "open_to_offers" in
        withOpenToOffersColumn({}, { isPublic: true, ...newCardOffersPatch({ category: "pc", isPublic: true }) }),
      false,
    );
  });

  it("sends the new card's badge from the add form, and keeps the switch off the add form", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /\.\.\.\(existing \? \{\} : newCardOffersPatch\(\{ category, isPublic: share \}\)\)/);
    assert.match(form, /visible=\{showOpenToOffersToggle\(\{\s*isEdit: Boolean\(existing\),/);
  });

  it("sends every Public toggle through the one helper", () => {
    assert.match(read("components/card-detail.tsx"), /updateCard\(card\.id, publicTogglePatch\(card, next\)\)/);
    assert.match(read("components/collection-tile-actions.tsx"), /updateCard\(card\.id, publicTogglePatch\(card, next\)\)/);
    assert.match(read("components/dashboard.tsx"), /updateCard\(card\.id, publicTogglePatch\(card, isPublic\)\)/);
  });

  it("turns the edit form's switch on when a card in the Open to offers pile is made Public", () => {
    const pile = { isEdit: true, columnKnown: true, wasPublic: false, isPublic: true } as const;
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "flipping" }), true);
    // A Personal card going Public keeps its own switch.
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "pc" }), false);
    // Not on the add form, and not while the column is unknown.
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "flipping", isEdit: false }), false);
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "flipping", columnKnown: false }), false);
    // Going private never turns it on.
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "flipping", wasPublic: true, isPublic: false }), false);
    // Tapping Public on a card that is already Public leaves a switch the owner turned off by hand alone.
    assert.equal(editFormPublicTurnsOffersOn({ ...pile, category: "flipping", wasPublic: true }), false);
  });

  it("wires the edit form's Public choice to the switch, and still lets the owner flip it by hand", () => {
    const form = read("components/card-form.tsx");
    const choose = form.split("function chooseVisibility(next: boolean) {")[1].split("\n  }\n")[0];
    // Going private still clears the switch and "Also post to my feed".
    assert.match(choose, /if \(!next\) \{\s*setOpenToOffers\(false\);\s*setShareToFeed\(false\);\s*\}/);
    // Going Public turns the switch on for a card in the Open to offers pile.
    assert.match(
      choose,
      /editFormPublicTurnsOffersOn\(\{\s*isEdit: Boolean\(existing\),\s*columnKnown: offersKnown,\s*category,\s*wasPublic: share,\s*isPublic: next,\s*\}\)\s*\) \{\s*setOpenToOffers\(true\);/,
    );
    // The switch is still the owner's to flip before saving, and save still sends its value.
    assert.match(form, /checked=\{openToOffers\}\s*onChange=\{setOpenToOffers\}/);
    assert.match(form, /\.\.\.\(offersKnown \? \{ openToOffers: Boolean\(share && openToOffers\) \} : \{\}\)/);
  });

  it("uses the existing field and the existing save path in every place a pile is moved", () => {
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /const patch = categoryMovePatch\(card, category\);/);
    assert.match(detail, /updateCard\(cardId, patch\)\.saved/);
    assert.match(read("components/collection-tile-actions.tsx"), /updateCard\(card\.id, categoryMovePatch\(card, other\)\)/);
    const form = read("components/card-form.tsx");
    // In the edit form the switch follows the move, and can still be flipped by hand before saving.
    assert.match(form, /if \(existing && offersKnown && next !== category\) setOpenToOffers\(next === "flipping"\);/);
    assert.match(form, /\.\.\.\(offersKnown \? \{ openToOffers: Boolean\(share && openToOffers\) \} : \{\}\)/);
    // No new column, no new table, no SQL: only the fields the card already has.
    assert.doesNotMatch(read("lib/offers/open-to-offers.ts").split("export function categoryMovePatch")[1].split("export function")[0], /supabase|sql|rpc/i);
  });
});
