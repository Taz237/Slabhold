import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { cardPageAccessDecision } from "./card-page-access";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

describe("cardPageAccessDecision", () => {
  it("not-founds a non-owned or private card before comps/value work", () => {
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "viewer", owned: false }),
      "notFound",
    );
  });

  it("allows the owner and skips local or logged-out sessions", () => {
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "owner", owned: true }),
      "allow",
    );
    assert.equal(
      cardPageAccessDecision({ cardId: "local-1", userId: "owner", owned: false }),
      "skip",
    );
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: null, owned: false }),
      "skip",
    );
  });

  it("page calls requireCardPageAccess before rendering CardDetail", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/cards/[id]/page.tsx"), "utf8");
    assert.match(page, /await requireCardPageAccess\(id\)/);
    const requireAt = page.indexOf("requireCardPageAccess");
    const detailAt = page.indexOf("<CardDetail");
    assert.ok(requireAt > 0 && detailAt > requireAt);
  });

  it("lets the owner open a new private card only after the save resolves", async () => {
    const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    const submitStart = form.indexOf("async function submit");
    const submit = form.slice(submitStart, form.indexOf("return (", submitStart));
    const awaitAt = submit.indexOf("await saved");
    const pushAt = submit.indexOf("router.push");
    assert.ok(awaitAt > 0 && pushAt > awaitAt);
    const catchAt = submit.indexOf("} catch");
    assert.ok(catchAt > pushAt);
    assert.equal(submit.slice(catchAt).includes("router.push"), false);
    assert.match(submit.slice(catchAt), /removeCard\(createdId\)/);
    assert.match(submit.slice(catchAt), /setSaving\(false\)/);
    assert.match(submit.slice(catchAt), /setSaveError\(/);

    const access = readFileSync(join(process.cwd(), "lib/value/require-card-page-access.ts"), "utf8");
    assert.match(access, /cardPageAccessDecision\(/);
    assert.match(access, /if \(decision === "notFound"\) deps\.notFound\(\)/);

    let resolveSave!: () => void;
    const saved = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const provider = {
      addCard: () => ({ card: { id: CARD }, saved }),
    };
    const pushes: string[] = [];
    const created = provider.addCard();
    const pending = (async () => {
      await created.saved;
      pushes.push(`/cards/${created.card.id}`);
    })();

    await Promise.resolve();
    assert.deepEqual(pushes, []);
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "owner", owned: false }),
      "notFound",
    );

    resolveSave();
    await pending;
    assert.deepEqual(pushes, [`/cards/${CARD}`]);
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "owner", owned: true }),
      "allow",
    );

    const failed = Promise.reject(new Error("Could not upload the photo."));
    void failed.catch(() => undefined);
    const missed: string[] = [];
    await assert.rejects(
      (async () => {
        await failed;
        missed.push(`/cards/${CARD}`);
      })(),
      /Could not upload the photo/,
    );
    assert.deepEqual(missed, []);
  });
});
