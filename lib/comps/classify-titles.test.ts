import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keptAndDroppedTitles } from "./classify-titles";

describe("keptAndDroppedTitles", () => {
  it("splits kept and dropped listing titles by item id", () => {
    const split = keptAndDroppedTitles(
      [
        { title: "Jaxson Dart Prizm #332", item_id: "keep-1" },
        { title: "Wrong player", item_id: "drop-1" },
        { title: "Another miss", item_id: "drop-2" },
      ],
      [{ itemId: "keep-1" }],
    );
    assert.deepEqual(split.keptTitles, ["Jaxson Dart Prizm #332"]);
    assert.deepEqual(split.droppedTitles, ["Wrong player", "Another miss"]);
  });
});
