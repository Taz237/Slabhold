import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  ADD_FORM_SUBLINE,
  ADD_VISIBLE_FIELDS,
  MORE_DETAILS_FIELDS,
  MORE_DETAILS_LABEL,
  addFormSections,
  draftOpensMoreDetails,
  firstInvalidField,
  revealField,
} from "@/lib/cards/add-form-sections";
import {
  assessNewCardSubmit,
  purchaseForSubmit,
  readNewCardDraft,
  writeNewCardDraft,
  clearNewCardDraft,
  type CardDraftForm,
  type NewCardDraft,
} from "@/lib/cards/new-card-draft";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
after(() => dom.window.close());

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const emptyForm: CardDraftForm = {
  playerName: "",
  yearLabel: "",
  setBrand: "",
  cardNumber: "",
  parallel: "Base",
  serialRun: "",
  serialNo: "",
  sport: "Basketball",
  purchasePrice: "",
  purchaseDate: "",
  estimatedSellPrice: "",
  sellPrice: "",
  sellDate: "",
  notes: "",
};

function draft(patch: Partial<NewCardDraft> = {}, form: Partial<CardDraftForm> = {}): NewCardDraft {
  return {
    seed: "\n",
    userId: null,
    pendingId: null,
    hadPhoto: false,
    form: { ...emptyForm, playerName: "Luka Dončić", ...form },
    noNumber: false,
    setIsCustom: false,
    parallelIsCustom: false,
    gradeCompany: "Raw",
    gradeNumber: "",
    gradeQualifier: "",
    certNumber: "",
    isRookie: false,
    isAuto: false,
    isRelic: false,
    sold: false,
    share: false,
    openToOffers: false,
    shareToFeed: false,
    caption: "",
    category: "pc",
    sportTouched: false,
    sportOffer: "",
    unknownPurchase: false,
    ...patch,
  };
}

describe("add card sections", () => {
  it("shows only the photo, card identity, grading, and the Add button on Add", () => {
    const sections = addFormSections(false);
    assert.ok(sections);
    assert.equal(sections.visible[0], "photo");
    assert.ok(!sections.visible.includes("search" as never), "no player search on Add");
    assert.ok(!sections.more.includes("photo" as never), "photo is not in More details");
    assert.deepEqual(
      [...sections.visible],
      [
        "photo",
        "playerName",
        "yearLabel",
        "setBrand",
        "cardNumber",
        "parallel",
        "gradingCompany",
        "grade",
        "submit",
      ],
    );
    assert.deepEqual([...ADD_VISIBLE_FIELDS], [...sections.visible]);
  });

  it("puts everything else in one closed More details section", () => {
    const sections = addFormSections(false)!;
    assert.equal(MORE_DETAILS_LABEL, "More details (optional)");
    for (const key of [
      "sport",
      "serialRun",
      "serialNo",
      "traits",
      "gradeExtras",
      "purchase",
      "estimatedSellPrice",
      "sold",
      "isPublic",
      "openToOffers",
      "notes",
      "shareToFeed",
      "category",
    ]) {
      assert.ok(sections.more.includes(key as never), `${key} is in More details`);
      assert.ok(!sections.visible.includes(key as never), `${key} is not visible`);
    }
    assert.deepEqual([...MORE_DETAILS_FIELDS], [...sections.more]);
  });

  it("keeps the full form on Edit", () => {
    assert.equal(addFormSections(true), null);
  });

  it("renders Add from the section lists and keeps the Edit layout", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /addFormSections\(Boolean\(existing\)\)/);
    assert.match(form, /sections\.visible\.map/);
    assert.match(form, /sections\.more\.map/);
    assert.match(form, /<details/);
    assert.match(form, /MORE_DETAILS_LABEL/);
    // Edit keeps its old subline. Add uses the new one.
    assert.equal(ADD_FORM_SUBLINE, "Snap a photo or fill in the basics. Everything else is optional.");
    assert.match(form, /What you paid, notes, sharing/);
    assert.doesNotMatch(form, /What you paid, photo, notes, sharing/);
    assert.match(form, /Player, set, what you paid, and a photo\./);
  });

  it("keeps the Add button above the bottom nav on mobile", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /sticky bottom-\[calc\(/);
  });
});

describe("opening More details", () => {
  it("names the first invalid field in form order", () => {
    const sold = assessNewCardSubmit({
      isEdit: false,
      form: { ...emptyForm, playerName: "Luka", yearLabel: "2018-19", setBrand: "Panini Prizm", cardNumber: "280", sellPrice: "" },
      noNumber: false,
      gradeCompany: "Raw",
      gradeNumber: "",
      sold: true,
    });
    assert.equal(firstInvalidField(sold, { ...emptyForm, sellDate: "" }), "sellPrice");
    assert.equal(firstInvalidField(sold, { ...emptyForm, sellPrice: "40", sellDate: "" }), "sellDate");
    const missing = assessNewCardSubmit({
      isEdit: false,
      form: emptyForm,
      noNumber: false,
      gradeCompany: "Raw",
      gradeNumber: "",
      sold: true,
    });
    assert.equal(firstInvalidField(missing, emptyForm), "playerName");
  });

  it("opens the closed section, then focuses the field inside it", () => {
    const doc = dom.window.document;
    doc.body.innerHTML = `
      <form>
        <input data-field="playerName" />
        <details><summary>More details (optional)</summary>
          <input data-field="sellPrice" />
        </details>
      </form>`;
    const form = doc.querySelector("form")!;
    const details = doc.querySelector("details")!;
    assert.equal(details.open, false);
    const el = revealField(form, "sellPrice");
    assert.ok(el);
    assert.equal(details.open, true);
    assert.equal(doc.activeElement, el);
  });

  it("leaves the section closed for a visible field", () => {
    const doc = dom.window.document;
    doc.body.innerHTML = `
      <form>
        <input data-field="playerName" />
        <details><summary>More</summary><input data-field="notes" /></details>
      </form>`;
    const form = doc.querySelector("form")!;
    revealField(form, "playerName");
    assert.equal(doc.querySelector("details")!.open, false);
    assert.equal(doc.activeElement, doc.querySelector('[data-field="playerName"]'));
    assert.equal(revealField(form, "missing"), null);
  });

  it("opens for a restored draft with any optional value", () => {
    assert.equal(draftOpensMoreDetails(null), false);
    assert.equal(draftOpensMoreDetails(draft()), false);
    assert.equal(draftOpensMoreDetails(draft({}, { notes: "Centered" })), true);
    assert.equal(draftOpensMoreDetails(draft({}, { purchasePrice: "20" })), true);
    assert.equal(draftOpensMoreDetails(draft({}, { purchaseDate: "2026-10-01" })), true);
    assert.equal(draftOpensMoreDetails(draft({ unknownPurchase: true })), true);
    assert.equal(draftOpensMoreDetails(draft({ sold: true })), true);
    assert.equal(draftOpensMoreDetails(draft({ share: true })), true);
    // The photo sits on top now, so a restored photo leaves the section closed.
    assert.equal(draftOpensMoreDetails(draft({ hadPhoto: true })), false);
    assert.equal(draftOpensMoreDetails(draft({ isAuto: true })), true);
    assert.equal(draftOpensMoreDetails(draft({ certNumber: "123" })), true);
    assert.equal(draftOpensMoreDetails(draft({ category: "flipping" })), true);
    assert.equal(draftOpensMoreDetails(draft({ sportTouched: true })), true);
  });
});

describe("bin cards", () => {
  it("starts a new card with no purchase date", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /purchaseDate: existing \? \(existing\.purchaseDate \?\? ""\) : ""/);
    assert.doesNotMatch(form, /todayDateInput\(\)/);
  });

  it("saves Don't know as no date and no price", () => {
    assert.deepEqual(
      purchaseForSubmit({ unknownPurchase: true, purchasePrice: "25", purchaseDate: "2026-10-01" }),
      { purchasePrice: null, purchaseDate: "" },
    );
    assert.deepEqual(
      purchaseForSubmit({ unknownPurchase: false, purchasePrice: "25", purchaseDate: "2026-10-01" }),
      { purchasePrice: 25, purchaseDate: "2026-10-01" },
    );
    assert.deepEqual(
      purchaseForSubmit({ unknownPurchase: false, purchasePrice: " ", purchaseDate: "" }),
      { purchasePrice: null, purchaseDate: "" },
    );
    assert.deepEqual(
      purchaseForSubmit({ unknownPurchase: false, purchasePrice: "0", purchaseDate: "" }),
      { purchasePrice: null, purchaseDate: "" },
    );
  });

  it("disables both inputs while Don't know is checked", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /Don’t know \(bin card\)|Don't know \(bin card\)/);
    assert.equal((form.match(/disabled=\{unknownPurchase\}/g) ?? []).length, 2);
    assert.match(form, /purchaseForSubmit\(/);
  });

  it("keeps Don't know through a draft restore", () => {
    clearNewCardDraft();
    writeNewCardDraft(draft({ unknownPurchase: true }));
    assert.equal(readNewCardDraft("\n", null)?.unknownPurchase, true);
    clearNewCardDraft();
    const form = read("components/card-form.tsx");
    assert.match(form, /useState\(restored\?\.unknownPurchase \?\? false\)/);
    assert.ok((form.match(/\bunknownPurchase,\n/g) ?? []).length >= 2, "written in both draft builders");
  });
});
