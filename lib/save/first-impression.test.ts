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
    const page = read("app/cards/new/page.tsx");
    assert.match(form, /existing \? cardCategory\(existing\) : "pc"/);
    assert.match(form, /: "Add a card"/);
    assert.doesNotMatch(form, /New position/);
    assert.match(page, /Add a card · Slabhold/);
    assert.match(form, /<Field label="Purchase date">/);
    assert.doesNotMatch(form, /Boolean\(form\.purchaseDate\)/);
    const mailDay = read("components/mail-day-form.tsx");
    assert.match(mailDay, /category: "flipping"/);
  });

  it("keeps the form, offers Retry, and ignores a second submit", () => {
    const form = read("components/card-form.tsx");
    const submitStart = form.indexOf("async function submit");
    const submit = form.slice(submitStart, form.indexOf("return (", submitStart));
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
    assert.match(catchSlice, /SAVE_TIMEOUT_MESSAGE/);
    assert.doesNotMatch(catchSlice, /setForm\(/);
    assert.doesNotMatch(catchSlice, /setPhoto\(null\)/);
    assert.doesNotMatch(catchSlice, /setCategory\(/);
    assert.match(form, /Retry/);
    assert.match(read("lib/social/cards.ts"), /withSaveTimeout\(/);
    assert.match(read("lib/social/cards.ts"), /removeUploadedMedia\(/);
  });
});

describe("mail day save", () => {
  it("times out, retries, and cleans up a photo without resetting what was typed", () => {
    const form = read("components/mail-day-form.tsx");
    const submitStart = form.indexOf("async function submit");
    const submit = form.slice(submitStart, form.indexOf("return (", submitStart));
    assert.match(submit, /claimSubmit\(sendingRef\)/);
    assert.match(submit, /withSaveTimeout/);
    assert.match(form, /if \(!sending\) sendingRef\.current = false/);
    assert.match(form, /finally \{\s*setSending\(false\);\s*\}/);
    assert.match(submit, /if \(!isSaveTimeout\(err\)\) throw err;/);
    assert.match(submit, /withSaveTimeout\(\(\) =>\s*createMailDayPost\(/);
    const outerCatch = form.slice(form.lastIndexOf("} catch (err) {"), form.indexOf("} finally {"));
    assert.match(outerCatch, /setError\(mailDaySubmitError\(err\)\)/);
    assert.doesNotMatch(outerCatch, /removeMailDayPhotos/);
    assert.doesNotMatch(submit, /setCaption\(/);
    assert.doesNotMatch(submit, /blankCard\(\)/);
    assert.match(form, />\s*Retry\s*</);
    const postTimeout = submit.slice(submit.indexOf("if (!isSaveTimeout(err)) throw err;"));
    assert.doesNotMatch(postTimeout.slice(0, postTimeout.indexOf("if (!result.ok)")), /removeMailDayPhotos/);
    assert.match(form, /postId: postId\.current/);
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
