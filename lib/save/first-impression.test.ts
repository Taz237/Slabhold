import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("add a card first impression", () => {
  it("defaults to PC, says Add a card, and does not require a purchase date", () => {
    const form = read("components/card-form.tsx");
    const page = read("app/(app)/cards/new/page.tsx");
    assert.match(form, /existing \? cardCategory\(existing\) : "pc"/);
    assert.match(form, /: "Add a card"/);
    assert.doesNotMatch(form, /New position/);
    assert.match(page, /Add a card · Slabhold/);
    assert.match(form, /<Field label="Purchase date">/);
    assert.doesNotMatch(form, /Boolean\(form\.purchaseDate\)/);
  });

  it("keeps the form, offers Retry, and ignores a second submit", () => {
    const form = read("components/card-form.tsx");
    const submitStart = form.indexOf("async function submit");
    // The function ends at the first two-space closing brace after it starts.
    const submit = form.slice(submitStart, form.indexOf("\n  }\n", submitStart));
    assert.match(submit, /claimSubmit\(savingRef\)/);
    assert.match(submit, /await saved/);
    const catchAt = submit.indexOf("} catch");
    const catchSlice = submit.slice(catchAt);
    assert.match(catchSlice, /removeCard\(createdId\)/);
    assert.match(catchSlice, /setSaveError\(/);
    assert.match(catchSlice, /setSaving\(false\)/);
    assert.match(catchSlice, /savingRef\.current = false/);
    assert.doesNotMatch(catchSlice, /router\.push/);
    assert.match(submit, /pendingId\.current = card\.id/);
    assert.match(catchSlice, /isSaveTimeout\(error\)/);
    assert.match(catchSlice, /timedOutIds\.current\.add\(createdId\)/);
    assert.match(catchSlice, /!timedOut\) removeCard\(createdId\)/);
    assert.match(catchSlice, /SAVE_TIMEOUT_MESSAGE/);
    assert.doesNotMatch(catchSlice, /setForm\(/);
    assert.doesNotMatch(catchSlice, /setPhoto\(null\)/);
    assert.doesNotMatch(catchSlice, /setCategory\(/);
    assert.match(form, /Retry/);
    assert.match(read("lib/social/cards.ts"), /withSaveTimeout\(/);
    assert.match(read("lib/social/cards.ts"), /removeUploadedMedia\(/);
  });
});

describe("collection save", () => {
  it("times out without dropping a saved card", () => {
    const provider = read("components/collection-provider.tsx");
    const addCard = provider.slice(
      provider.indexOf("const addCard = useCallback("),
      provider.indexOf("const updateCard = useCallback("),
    );
    assert.match(
      addCard,
      /await saveUserCard\(client, userId, card\);\r?\n\s*trackEvent\("card_added"\);/,
    );
    assert.match(addCard, /void saved\.catch\(\(\) => undefined\)/);
    assert.match(addCard, /if \(!isSaveTimeout\(error\)\) forgetCard\(card\.id\)/);
    assert.doesNotMatch(addCard, /noteFreshInsert/);
    const updateCard = provider.slice(
      provider.indexOf("const updateCard = useCallback("),
      provider.indexOf("const removeCard = useCallback("),
    );
    assert.match(updateCard, /if \(!isSaveTimeout\(error\)\) revert\(\)/);
    assert.match(updateCard, /void saved\.catch\(\(\) => undefined\)/);
    assert.doesNotMatch(updateCard, /removeUserCard/);
  });
});
