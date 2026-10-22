import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { mailDayComposerStatus, mailDaySubmitBlocker, previewMailDayPost } from "./mail-day";
import type { MailDayDraftCard } from "./mail-day";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function draft(patch: Partial<MailDayDraftCard> = {}): MailDayDraftCard {
  return {
    playerName: "J.J. McCarthy",
    yearLabel: "2024",
    setBrand: "Donruss Optic",
    setIsCustom: false,
    cardNumber: "303",
    parallel: "Pink",
    parallelIsCustom: false,
    sport: "Football",
    conditionType: "raw",
    grader: "",
    grade: "",
    paid: "",
    source: "ebay",
    category: "flipping",
    isPublic: true,
    showPaid: false,
    isRookie: true,
    photos: ["data:image/jpeg;base64,abc"],
    ...patch,
  };
}

describe("Mail Day composer", () => {
  it("asks for a photo beside the button and still blocks the save", () => {
    assert.equal(mailDayComposerStatus(null), null);
    assert.equal(mailDayComposerStatus("Add a photo for card 1"), "Add a photo to post");
    assert.equal(mailDayComposerStatus("Add a photo for card 2"), "Add a photo to post");
    assert.equal(mailDayComposerStatus("Add the player for card 1"), "Add the player for card 1");
    assert.equal(mailDaySubmitBlocker([draft({ photos: [] })]), "Add a photo for card 1");
    assert.equal(mailDaySubmitBlocker([draft()]), null);

    const form = read("components/mail-day-form.tsx");
    const open = form.slice(form.indexOf("{section.open ? ("));
    const cardBody = open.slice(0, open.indexOf("Add another card"));
    assert.ok(cardBody.indexOf("<PhotoRow") < cardBody.indexOf("<CardSearch"));
    assert.match(form, /1 to 4 photos/);
    assert.doesNotMatch(form, /text-xs text-zinc-500">1 to 4 photos/);
    const submit = form.indexOf("Log Mail Day");
    const beside = form.slice(submit - 700, submit);
    assert.match(beside, /composerStatus/);
    assert.match(beside, /disabled=\{sending \|\| Boolean\(blocker\)\}/);
    const preview = form.slice(form.indexOf('aria-label="Preview"'));
    assert.match(preview, /\{caption\.trim\(\) \?/);
    assert.match(preview, /<MailDayCard/);
  });

  it("puts the typed caption and photos on the preview post", () => {
    const post = previewMailDayPost({
      authorId: "owner",
      caption: "Pulled this today",
      cards: [draft({ photos: ["data:image/jpeg;base64,front", "data:image/jpeg;base64,back"] })],
    });
    assert.equal(post.body, "Pulled this today");
    assert.deepEqual(post.mailDayCards?.[0]?.photos, [
      "data:image/jpeg;base64,front",
      "data:image/jpeg;base64,back",
    ]);
    assert.equal(post.mailDayCards?.[0]?.card.playerName, "J.J. McCarthy");
  });
});
