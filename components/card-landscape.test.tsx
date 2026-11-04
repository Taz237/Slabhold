import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import { CardSlabArt, photoClass } from "@/components/card-slab-art";
import { CardThumb, ShapedCardThumb } from "@/components/card-thumb";
import { CardPhotoField } from "@/components/card-photo-field";
import { forgetCardShapes, rememberShape } from "@/lib/ui/card-shape";

installDom();

const RAW: ArtCard = {
  playerName: "Demo Collector",
  year: 2023,
  yearLabel: "",
  setBrand: "Prizm",
  grade: "",
  gradeQualifier: "",
  certNumber: "",
  accent: "#7C3AED",
  conditionType: "raw",
};
const SLAB: ArtCard = { ...RAW, grade: "PSA 10", grader: "PSA", certNumber: "12345678", conditionType: "graded" };

const WIDE = "https://example.com/demo/wide.jpg";
const TALL = "https://example.com/demo/tall.jpg";

// The portrait classes as they are on main. Portrait must not change at all.
const RAW_TILE = "flex aspect-[3/5] w-full flex-col justify-end";
const RAW_PHOTO =
  "relative aspect-[5/7] w-full overflow-hidden rounded-lg border border-black/10 bg-zinc-900 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.55)] dark:border-white/10";
const SLAB_PHOTO =
  "relative aspect-[5/7] h-full max-w-full overflow-hidden rounded-[3px] bg-zinc-900 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]";

function frame(card: ArtCard, shape?: "portrait" | "landscape") {
  return renderToStaticMarkup(
    <SlabFrame card={card} shape={shape}>
      <i />
    </SlabFrame>,
  );
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  forgetCardShapes();
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

function load(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
  act(() => {
    img.dispatchEvent(new window.Event("load"));
  });
}

describe("SlabFrame shape", () => {
  it("draws portrait exactly as before, with or without the prop", () => {
    for (const card of [RAW, SLAB]) {
      assert.equal(frame(card, "portrait"), frame(card));
      assert.doesNotMatch(frame(card), /data-shape|aspect-\[7\/5\]/);
    }
    assert.ok(frame(RAW).includes(`class="${RAW_TILE}"`));
    assert.ok(frame(RAW).includes(`class="${RAW_PHOTO}"`));
    assert.ok(frame(SLAB).includes(`class="${SLAB_PHOTO}"`));
  });

  it("gives a raw landscape card a 7:5 window, centred in the same 3:5 tile", () => {
    const out = frame(RAW, "landscape");
    assert.match(out, /data-shape="landscape"/);
    assert.match(out, /class="flex aspect-\[3\/5\] w-full flex-col justify-center"/);
    assert.match(out, /class="relative aspect-\[7\/5\] w-full overflow-hidden/);
    assert.doesNotMatch(out, /aspect-\[5\/7\]|row-span|col-span/);
  });

  it("gives a slabbed landscape card a 7:5 window under the same label", () => {
    const out = frame(SLAB, "landscape");
    assert.match(out, /data-kind="slab"/);
    assert.match(out, /relative flex aspect-\[3\/5\] w-full/);
    assert.match(out, /class="relative aspect-\[7\/5\] max-h-full w-full overflow-hidden/);
    assert.match(out, /PSA/);
    assert.doesNotMatch(out, /aspect-\[5\/7\]/);
  });
});

describe("photoClass shape", () => {
  it("contains a landscape photo and still crops a portrait one", () => {
    assert.match(photoClass({ eager: true, status: "loaded", shape: "landscape" }), /object-contain/);
    assert.doesNotMatch(photoClass({ eager: true, status: "loaded", shape: "landscape" }), /object-cover/);
    assert.equal(photoClass({ eager: true, status: "loaded", shape: "portrait" }), photoClass({ eager: true, status: "loaded" }));
    assert.match(photoClass({ eager: false, status: "loading" }), /object-cover/);
  });
});

describe("CardSlabArt", () => {
  function art(card: ArtCard, src: string) {
    return createElement(CardSlabArt, {
      card,
      index: 99,
      source: { kind: "plain", src },
      status: "loading",
      onStatus: () => {},
    });
  }

  it("turns a tile landscape once a wide photo loads", () => {
    act(() => root!.render(art(RAW, WIDE)));
    assert.equal(host.querySelector("[data-shape]"), null, "portrait until measured");
    load(host.querySelector("img")!, 1400, 1000);
    assert.equal(host.querySelector("[data-kind]")?.getAttribute("data-shape"), "landscape");
    assert.match(host.querySelector("img")!.className, /object-contain/);
  });

  it("keeps a tall photo portrait", () => {
    act(() => root!.render(art(SLAB, TALL)));
    load(host.querySelector("img")!, 1000, 1400);
    assert.equal(host.querySelector("[data-shape]"), null);
    assert.match(host.querySelector("img")!.className, /object-cover/);
  });

  it("draws a photo it has seen before landscape from the first paint", () => {
    rememberShape(WIDE, 1400, 1000);
    act(() => root!.render(art(SLAB, WIDE)));
    assert.equal(host.querySelector("[data-kind]")?.getAttribute("data-shape"), "landscape");
  });

  it("falls back to the portrait placeholder when the photo fails", () => {
    rememberShape(WIDE, 1400, 1000);
    act(() =>
      root!.render(
        createElement(CardSlabArt, { card: RAW, index: 99, source: { kind: "plain", src: WIDE }, status: "error", onStatus: () => {} }),
      ),
    );
    assert.equal(host.querySelector("[data-shape]"), null);
    assert.ok(host.querySelector("[data-placeholder]"));
  });
});

describe("CardThumb onShape", () => {
  const card = { playerName: "Demo Collector", photoDataUrl: WIDE, accent: "#7C3AED" };

  it("is unchanged without the prop", () => {
    act(() => root!.render(createElement(CardThumb, { card, className: "h-12 w-9" })));
    const img = host.querySelector("img")!;
    load(img, 1400, 1000);
    assert.equal(img.className, "object-cover h-12 w-9");
  });

  it("reports a landscape photo and shows it whole", () => {
    const seen: string[] = [];
    act(() => root!.render(createElement(CardThumb, { card, className: "h-12 w-9", onShape: (s) => seen.push(s) })));
    load(host.querySelector("img")!, 1400, 1000);
    assert.ok(seen.includes("landscape"));
    assert.match(host.querySelector("img")!.className, /^object-contain /);
  });

  it("turns a stats thumb sideways for a landscape card only", () => {
    act(() =>
      root!.render(
        createElement(ShapedCardThumb, { card, className: "h-12 w-9 shrink-0 rounded-md", landscapeClassName: "h-9 w-12 shrink-0 rounded-md" }),
      ),
    );
    assert.match(host.querySelector("img")!.className, /h-12 w-9/);
    load(host.querySelector("img")!, 1400, 1000);
    assert.equal(host.querySelector("img")!.className, "object-contain h-9 w-12 shrink-0 rounded-md");
  });

  it("keeps a portrait stats thumb as it was", () => {
    const tall = { ...card, photoDataUrl: TALL };
    act(() =>
      root!.render(
        createElement(ShapedCardThumb, { card: tall, className: "h-11 w-[33px] shrink-0 rounded-md", landscapeClassName: "h-[33px] w-11 shrink-0 rounded-md" }),
      ),
    );
    load(host.querySelector("img")!, 1000, 1400);
    assert.equal(host.querySelector("img")!.className, "object-cover h-11 w-[33px] shrink-0 rounded-md");
  });
});

describe("upload preview", () => {
  const props = {
    photoError: null,
    scanning: false,
    onTake: () => {},
    onLibrary: () => {},
    onRemove: () => {},
    onRetry: () => {},
    cameraRef: { current: null },
    libraryRef: { current: null },
    onPick: () => {},
  };

  it("previews a landscape photo at 7:5 and a portrait one at 5:7", () => {
    act(() => root!.render(createElement(CardPhotoField, { ...props, photo: WIDE })));
    const img = host.querySelector('img[alt="Card"]') as HTMLImageElement;
    const box = img.parentElement as HTMLElement;
    assert.equal(box.style.aspectRatio, "5 / 7");
    load(img, 1400, 1000);
    assert.equal(box.style.aspectRatio, "7 / 5");
    assert.match(img.className, /object-contain/);

    act(() => root!.render(createElement(CardPhotoField, { ...props, photo: TALL })));
    const tallImg = host.querySelector('img[alt="Card"]') as HTMLImageElement;
    load(tallImg, 1000, 1400);
    assert.equal((tallImg.parentElement as HTMLElement).style.aspectRatio, "5 / 7");
  });
});
