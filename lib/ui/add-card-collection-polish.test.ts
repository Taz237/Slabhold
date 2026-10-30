import assert from "node:assert/strict";
import { createElement } from "react";
import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { CollectionLaneEmpty } from "@/components/collection-lane-empty";
import { SETS, sortSetNames } from "@/lib/card-options";
import { todayDateInput } from "@/lib/cards/form-defaults";
import { cardFormPreview, EMPTY_CARD_PREVIEW } from "@/lib/cards/form-preview";
import { collectionFilterEmpty } from "@/lib/collection/lane-empty";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("add card form polish", () => {
  const form = read("components/card-form.tsx");

  it("names the photo control Photo and keeps a neutral empty preview", () => {
    assert.doesNotMatch(form, /Photo & scan/);
    assert.match(form, /<CardPhotoField/);
    assert.match(read("components/card-photo-field.tsx"), />Photo</);
    assert.equal(
      cardFormPreview({
        playerName: "",
        year: 0,
        setBrand: "",
        parallel: "Base",
        conditionType: "raw",
        grade: "Raw",
      }).text,
      EMPTY_CARD_PREVIEW,
    );
    const filled = cardFormPreview({
      playerName: "Jaxson Dart",
      year: 2025,
      yearLabel: "2025",
      setBrand: "Panini Prizm",
      cardNumber: "332",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    });
    assert.equal(filled.placeholder, false);
    assert.match(filled.text, /Jaxson Dart/);
    assert.doesNotMatch(filled.text, /Set Player/);
  });

  it("uses example hints instead of realistic price placeholders", () => {
    assert.match(form, /placeholder="e\.g\. 25\.00"/);
    assert.doesNotMatch(form, /placeholder="185"/);
    assert.doesNotMatch(form, /placeholder="10"/);
    assert.doesNotMatch(form, /placeholder="7 \(optional\)"/);
  });

  it("holds the grade error until the grade field is touched or the form is submitted", () => {
    const choose = form.slice(
      form.indexOf("function chooseGradeCompany"),
      form.indexOf("async function submit"),
    );
    assert.doesNotMatch(choose, /markTouched\("grade"\)/);
    assert.match(form, /onBlur=\{\(\) => markTouched\("grade"\)\}/);
    assert.match(form, /touched\.grade && !gradeNumber \? "Choose a grade"/);
    assert.match(form, /grade: true/);
  });

  it("explains that cards are private by default", () => {
    assert.match(
      form,
      /Cards are private by default\. You can show them on your profile\./,
    );
  });

  it("prefills a new card from the search query and leaves a saved card alone", () => {
    assert.match(form, /parseManualPrefill\(initialQuery\)/);
    assert.match(form, /existing\?\.playerName \?\? manualPrefill\?\.playerName/);
    // Add card has no search box now. The query only prefills the typed fields.
    assert.doesNotMatch(form, /<CardSearch/);
    const page = read("app/(app)/cards/new/page.tsx");
    assert.match(page, /searchParams: Promise</);
    assert.match(page, /await searchParams/);
    // Add card opens the guided picker. It still gets the query and the Search pick.
    assert.match(page, /<CardForm\s+guided\s+initialQuery=\{initialQuery\}\s+initialCatalog=\{initialCatalog\}/);
  });

  it("starts a new card's purchase date empty without touching a saved date", () => {
    assert.equal(todayDateInput(new Date(2026, 9, 21)), "2026-10-21");
    assert.equal(todayDateInput(new Date(2026, 0, 5)), "2026-01-05");
    // Bin cards have no purchase date, so Add no longer seeds today.
    assert.match(form, /existing \? \(existing\.purchaseDate \?\? ""\) : ""/);
    assert.match(form, /suppressHydrationWarning/);
  });

  it("sets decimal and numeric keyboards and 44px checkbox targets", () => {
    assert.match(form, /inputMode="decimal"/);
    assert.match(form, /inputMode="numeric"/);
    assert.match(form, /inline-flex min-h-11 items-center gap-2/);
    assert.match(form, /flex min-h-11 items-center gap-2/);
    assert.match(form, /flex min-h-11 items-center gap-3/);
  });

  it("does not use a numeric keyboard for card number or year", () => {
    const cardNumber = form.slice(
      form.indexOf('label="Card number"'),
      form.indexOf("No number on card"),
    );
    assert.match(cardNumber, /aria-label="Card number"/);
    assert.match(cardNumber, /placeholder="e\.g\. 136 or BCP-1"/);
    assert.doesNotMatch(cardNumber, /inputMode="numeric"/);
    assert.doesNotMatch(cardNumber, /inputMode=/);

    const year = form.slice(form.indexOf('label="Year"'), form.indexOf('label="Sport"'));
    assert.match(year, /inputMode="text"/);
    assert.doesNotMatch(year, /inputMode="numeric"/);
  });

  it("sorts the set list alphabetically without reordering the source list", () => {
    const original = SETS[0];
    const sorted = sortSetNames(SETS);
    assert.equal(SETS[0], original);
    assert.deepEqual(
      sorted,
      [...SETS].sort((a, b) =>
        a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
      ),
    );
    assert.ok(sorted.indexOf("Bowman") < sorted.indexOf("Panini Prizm"));
    assert.ok(sorted.indexOf("Topps Series 1") < sorted.indexOf("Topps Series 2"));
    assert.match(form, /sortSetNames\(SETS\)/);
  });

  it("does not add Show what I paid, because cards has no column for it", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const files = [
      join(process.cwd(), "supabase/schema.sql"),
      ...readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .map((name) => join(dir, name)),
    ];
    for (const file of files) {
      const sql = readFileSync(file, "utf8");
      assert.doesNotMatch(
        sql,
        /alter table public\.cards[\s\S]{0,120}show_paid/i,
        file,
      );
    }
    const mailDay = read("supabase/migrations/20261019180000_mail_day.sql");
    assert.match(mailDay, /alter table public\.posts[\s\S]{0,80}show_paid/);
    assert.doesNotMatch(read("lib/social/cards.ts"), /show_paid/);
    assert.doesNotMatch(form, /Show what I paid/);
  });
});

describe("card search manual entry", () => {
  it("offers manual entry under the results and prefills from the query", () => {
    const search = read("components/card-search.tsx");
    assert.match(search, /Not seeing your card\? Add it manually/);
    assert.match(search, /Add this card yourself/);
    assert.match(search, /results\.length === 0/);
    assert.match(search, /onManual\(parseManualPrefill\(query\)\)/);
    assert.match(search, /results\.length \+ 1/);
  });
});

describe("collection screens", () => {
  it("gives Flipping and Personal their own empty states", () => {
    assert.equal(collectionFilterEmpty("flipping").title, "No Flipping cards yet");
    assert.match(collectionFilterEmpty("flipping").detail, /Flipping/);
    assert.equal(collectionFilterEmpty("pc").title, "No Personal cards yet");
    assert.match(collectionFilterEmpty("pc").detail, /Personal/);
    assert.notEqual(
      collectionFilterEmpty("flipping").detail,
      collectionFilterEmpty("pc").detail,
    );

    const flipping = renderToStaticMarkup(
      createElement(CollectionLaneEmpty, { lane: "flipping" }),
    );
    const personal = renderToStaticMarkup(
      createElement(CollectionLaneEmpty, { lane: "pc" }),
    );
    assert.match(flipping, /No Flipping cards yet/);
    assert.match(personal, /No Personal cards yet/);
    assert.doesNotMatch(flipping, /Your collection starts here/);
    assert.doesNotMatch(personal, /Your collection starts here/);

    const dash = read("components/dashboard.tsx");
    assert.match(dash, /lane === "flipping" \|\| lane === "pc" \? \(/);
    assert.match(dash, /syncError \? null : lane === "flipping" \|\| lane === "pc"/);
    assert.match(dash, /<CollectionLaneEmpty lane=\{lane\} \/>/);
    assert.match(dash, /<CollectionLaneEmpty lane=\{lane\} onShowAll=/);
  });

  it("keeps Public and Private on the card page and a small lock on the collection tile", () => {
    const grid = read("components/collection-grid.tsx");
    assert.match(grid, /onVisibility/);
    assert.match(read("components/dashboard.tsx"), /onVisibility=\{\(card, isPublic\) => updateCard\(card\.id, publicTogglePatch\(card, isPublic\)\)\}/);
    assert.match(read("components/card-detail.tsx"), /<CardVisibilitySwitch/);
  });

  it("shows the profile collection note only to the owner with no public cards", () => {
    const profile = read("components/profile-view.tsx");
    assert.doesNotMatch(profile, /Your book stays on this device/);
    assert.match(profile, /isOwn && cardsReady && collection\.length === 0/);
    assert.match(
      profile,
      /Cards are private by default\.[\s\S]{0,240}mark a card public to show it here\./,
    );
  });
});

describe("signed-out landing overflow", () => {
  it("keeps the feature panels inside the column without a visible scrollbar", () => {
    const landing = (read("components/landing-page.tsx") + read("components/landing/landing-links.tsx"));
    const panels = read("components/landing/feature-panels.tsx");
    assert.match(landing, /overflow-x-clip/);
    assert.match(panels, /flex min-w-0 snap-x snap-mandatory/);
    assert.match(panels, /overflow-x-auto/);
    assert.match(panels, /scrollbar-width:none/);
    assert.match(panels, /w-full shrink-0 snap-start/);
  });
});
