import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { installDom } from "@/lib/test/dom";
import { fadeInWhenLoaded } from "./fade-in-image";

const { win } = installDom();
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function image(complete: boolean) {
  const node = document.createElement("img");
  Object.defineProperty(node, "complete", { value: complete });
  return node;
}

describe("photos fade in over their placeholder", () => {
  it("shows an image that is already in at once", () => {
    const node = image(true);
    fadeInWhenLoaded(node);
    assert.equal(node.hasAttribute("data-loaded"), true);
  });

  it("waits for the load, and never hides a failed image", () => {
    const loading = image(false);
    fadeInWhenLoaded(loading);
    assert.equal(loading.hasAttribute("data-loaded"), false);
    loading.dispatchEvent(new win.Event("load"));
    assert.equal(loading.hasAttribute("data-loaded"), true);

    const broken = image(false);
    fadeInWhenLoaded(broken);
    broken.dispatchEvent(new win.Event("error"));
    assert.equal(broken.hasAttribute("data-loaded"), true);
    fadeInWhenLoaded(null);
  });

  it("fades with opacity only, and not at all with Reduce Motion", () => {
    const css = read("app/globals.css");
    assert.match(css, /img\[data-fade\] \{\s*transition: opacity 180ms ease-out;\s*\}/);
    assert.match(css, /img\[data-fade\]:not\(\[data-loaded\]\) \{\s*opacity: 0;\s*\}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*img\[data-fade\] \{\s*transition: none;/);
  });

  it("is on lazy post photos only: first-screen photos paint straight from the server HTML", () => {
    const grid = read("components/post-photo-grid.tsx");
    assert.equal((grid.match(/data-fade=\{eager \? undefined : ""\}/g) ?? []).length, 2);
    assert.equal((grid.match(/ref=\{eager \? undefined : fadeInWhenLoaded\}/g) ?? []).length, 2);
  });

  it("gives avatars a placeholder colour while they load", () => {
    const avatar = read("components/avatar.tsx");
    assert.equal((avatar.match(/rounded-full bg-zinc-200 object-cover dark:bg-white\/10/g) ?? []).length, 2);
  });
});

describe("long lists", () => {
  it("profile posts skip layout and paint off screen, like Home's rows", () => {
    assert.match(read("components/profile-view.tsx"), /<FeedItem key=\{item\.key\} itemKey=\{`profile:\$\{item\.key\}`\} delay=\{null\}>/);
  });
});

describe("search", () => {
  it("keeps the last results on screen, dimmed, while the next ones load", () => {
    const view = read("components/search-view.tsx");
    assert.match(view, /if \(!wantsCatalogSearch\(typed\)\) setCatalogCards\(\[\]\);/);
    assert.match(view, /catalogLoading && catalogCards\.length === 0 \? \(/);
    assert.match(view, /catalogLoading \? "opacity-60" : ""/);
  });
});
