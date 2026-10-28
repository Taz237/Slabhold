import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CardThumb } from "./card-thumb";

installDom();

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

const PHOTO = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/u1/gone.jpg";

describe("CardThumb", () => {
  it("swaps a photo that fails to load for the no-photo fallback", () => {
    act(() =>
      root!.render(
        createElement(CardThumb, {
          card: { playerName: "Jalen Brunson", photoDataUrl: PHOTO, accent: "#7c5cff" },
        }),
      ),
    );
    const img = document.querySelector("img");
    assert.ok(img, "the photo renders first");
    act(() => {
      img.dispatchEvent(new window.Event("error"));
    });
    assert.equal(document.querySelector("img"), null, "no broken-image icon");
    assert.match(document.body.textContent ?? "", /JB/);
  });

  it("shows the fallback when there is no photo", () => {
    act(() =>
      root!.render(
        createElement(CardThumb, {
          card: { playerName: "Jalen Brunson", photoDataUrl: null, accent: "#7c5cff" },
        }),
      ),
    );
    assert.equal(document.querySelector("img"), null);
    assert.match(document.body.textContent ?? "", /JB/);
  });
});
