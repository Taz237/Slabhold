import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CARD_VALUE_IDS,
  parseCardValueIds,
  visibleCardIds,
} from "./card-value-access";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

describe("card value id visibility", () => {
  it("drops a private id for logged-out callers", () => {
    const visible = visibleCardIds(
      ["private-card", "public-card"],
      new Set(["public-card"]),
      new Set(),
    );
    assert.deepEqual(visible, ["public-card"]);
    assert.equal(visible.includes("private-card"), false);
  });

  it("returns the signed-in user's own private card", () => {
    const visible = visibleCardIds(
      ["mine", "someone-else"],
      new Set(),
      new Set(["mine"]),
    );
    assert.deepEqual(visible, ["mine"]);
  });

  it("keeps public ids and the owner's private ids together", () => {
    const visible = visibleCardIds(
      ["public-card", "mine", "other-private"],
      new Set(["public-card"]),
      new Set(["mine"]),
    );
    assert.deepEqual(visible, ["public-card", "mine"]);
  });

  it("rejects more than 100 ids", () => {
    const ids = Array.from({ length: MAX_CARD_VALUE_IDS + 1 }, (_, index) => uuid(index + 1));
    const parsed = parseCardValueIds(ids);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "too_many");
  });

  it("accepts 100 unique ids and ignores blanks", () => {
    const ids = Array.from({ length: MAX_CARD_VALUE_IDS }, (_, index) => uuid(index + 1));
    const parsed = parseCardValueIds(["", "  ", ...ids, ids[0]]);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.ids.length, MAX_CARD_VALUE_IDS);
  });

  it("skips ids that are not uuids and keeps the rest of the batch", () => {
    const good = uuid(7);
    const parsed = parseCardValueIds(["nope", good, "also-bad", good, ""]);
    assert.deepEqual(parsed, { ok: true, ids: [good] });
  });

  it("is empty when every id is invalid", () => {
    const parsed = parseCardValueIds(["nope", "47"]);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "empty");
  });
});
