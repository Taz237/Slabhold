import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearComposeDraft,
  composeDraftKey,
  keepComposeDraft,
  takeComposeDraft,
  type ComposeDraft,
} from "./compose-draft";

const draft = (patch: Partial<ComposeDraft> = {}): ComposeDraft => ({
  body: "Pulled a Wemby silver",
  images: [],
  cardId: "",
  quoteId: null,
  ...patch,
});

describe("compose draft store", () => {
  beforeEach(() => clearComposeDraft());

  it("keys a draft by mode, and keeps nothing for an edit", () => {
    assert.equal(composeDraftKey({ edit: null, quote: null, card: null }), "new");
    assert.equal(composeDraftKey({ edit: null, quote: "p1", card: null }), "quote:p1");
    assert.equal(composeDraftKey({ edit: null, quote: null, card: "c1" }), "card:c1");
    assert.equal(composeDraftKey({ edit: null, quote: "p1", card: "c1" }), "quote:p1|card:c1");
    assert.equal(composeDraftKey({ edit: "p9", quote: null, card: null }), null);
    assert.equal(composeDraftKey({ edit: "p9", quote: "p1", card: "c1" }), null);
  });

  it("keeps a draft and gives it back once, in the same mode only", () => {
    keepComposeDraft("quote:p1", draft({ quoteId: "p1" }));
    assert.equal(takeComposeDraft("new"), null);
    assert.equal(takeComposeDraft("quote:p2"), null);
    assert.deepEqual(takeComposeDraft("quote:p1"), draft({ quoteId: "p1" }));
    assert.equal(takeComposeDraft("quote:p1"), null);
  });

  it("restores body, photos, card and quote", () => {
    const full = draft({ images: ["data:image/jpeg;base64,AAA"], cardId: "c1", quoteId: "p1" });
    keepComposeDraft("quote:p1", full);
    const back = takeComposeDraft("quote:p1");
    assert.deepEqual(back, full);
    assert.notEqual(back?.images, full.images, "a copy, not the live array");
  });

  it("holds one draft: the newest wins", () => {
    keepComposeDraft("new", draft({ body: "first" }));
    keepComposeDraft("quote:p1", draft({ body: "second", quoteId: "p1" }));
    assert.equal(takeComposeDraft("new"), null);
    assert.equal(takeComposeDraft("quote:p1")?.body, "second");
  });

  it("keeps nothing empty, and an empty Back drops an older draft for that mode", () => {
    keepComposeDraft("new", draft({ body: "   " }));
    assert.equal(takeComposeDraft("new"), null);
    keepComposeDraft("new", draft());
    keepComposeDraft("new", draft({ body: "" }));
    assert.equal(takeComposeDraft("new"), null);
  });

  it("keeps a photo-only or card-only draft", () => {
    keepComposeDraft("new", draft({ body: "", images: ["data:image/png;base64,AA"] }));
    assert.equal(takeComposeDraft("new")?.images.length, 1);
    keepComposeDraft("new", draft({ body: "", cardId: "c1" }));
    assert.equal(takeComposeDraft("new")?.cardId, "c1");
  });

  it("is cleared by Post and Discard", () => {
    keepComposeDraft("new", draft());
    clearComposeDraft();
    assert.equal(takeComposeDraft("new"), null);
  });

  it("never touches localStorage or sessionStorage", async () => {
    const source = (await import("node:fs")).readFileSync(new URL("./compose-draft.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  });
});

describe("composer draft wiring", () => {
  it("keeps on unmount unless posted or discarded, and restores on open", async () => {
    const { readFileSync } = await import("node:fs");
    const view = readFileSync(new URL("../../components/compose-view.tsx", import.meta.url), "utf8");
    assert.match(view, /composeDraftKey\(\{ edit: editId, quote: quoteParam, card: attachCardParam \}\)/);
    assert.match(view, /if \(key && !settled\) keepComposeDraft\(key, draft\);/);
    assert.match(view, /const kept = draftKey \? takeComposeDraft\(draftKey\) : null;/);
    // Post and Discard settle the draft; Cancel on an empty composer just closes.
    assert.match(view, /settleDraft\(\);\s*router\.push\(editing \?/);
    assert.match(view, /function discard\(\) \{\s*settleDraft\(\);\s*leave\(\);/);
    assert.match(view, /onClick=\{discard\}/);
    assert.match(view, /shouldConfirmDiscard\(/);
    // No history trap: Back is the browser's own.
    assert.doesNotMatch(view, /pushState|replaceState|popstate/);
  });
});
