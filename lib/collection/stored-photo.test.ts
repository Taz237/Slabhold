import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adoptStoredPhoto } from "@/lib/collection/stored-photo";

const DATA = "data:image/jpeg;base64,YQ==";
const URL = "https://cdn.example/user/a.jpg";

describe("adoptStoredPhoto", () => {
  it("swaps the local photo for the stored URL once the save lands", () => {
    const cards = [{ id: "a", photoDataUrl: DATA }, { id: "b", photoDataUrl: DATA }];
    const next = adoptStoredPhoto(cards, "a", DATA, URL);
    assert.equal(next[0].photoDataUrl, URL);
    assert.equal(next[1].photoDataUrl, DATA);
  });

  it("leaves a card alone whose photo changed since, or that has no stored URL", () => {
    const cards = [{ id: "a", photoDataUrl: "data:image/png;base64,Yg==" }];
    assert.equal(adoptStoredPhoto(cards, "a", DATA, URL), cards);
    assert.equal(adoptStoredPhoto(cards, "a", DATA, null), cards);
    assert.equal(adoptStoredPhoto(cards, "a", URL, URL), cards);
  });
});
