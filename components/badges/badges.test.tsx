import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { Badge } from "./badge";
import { BadgeRevealView } from "./badge-reveal";
import { ProfileBadgeStrip } from "./profile-badge-strip";
import type { BadgeReveal } from "@/lib/badges/reveal";

const { state } = installDom();

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
});

function mount(element: ReactNode) {
  act(() => root!.render(element));
}

const reveal: BadgeReveal = {
  headline: { id: "b1", category: "collector", tier: "legendary" },
  title: "Legendary Collector unlocked",
  next: null,
  others: [{ id: "b2", category: "streak", tier: "gold" }],
  ids: ["b1", "b2"],
};

describe("Badge", () => {
  it("layers the approved frame and icon with an accessible name", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tier: "gold", category: "slab-king", size: 32 }));
    assert.match(html, /src="\/badges\/frames\/frame-gold\.svg"/);
    assert.match(html, /src="\/badges\/icons\/icon-slab-king\.svg"/);
    assert.match(html, /aria-label="Slab king, Gold"/);
    assert.match(html, /width:32px;height:32px/);
    assert.match(html, /left:31.05%;top:31.05%;width:37.9%;height:37.9%/);
    assert.doesNotMatch(html, /badge-aura/);
  });

  it("shows the locked silhouette, a lock dot, and a ring filled to progress", () => {
    const html = renderToStaticMarkup(
      createElement(Badge, { tier: "silver", category: "collector", locked: true, progress: 0.5 }),
    );
    assert.match(html, /frame-locked-silver\.svg/);
    assert.doesNotMatch(html, /\/badges\/frames\//);
    assert.match(html, /aria-label="Collector, Silver, locked"/);
    const arc = html.match(/data-ring="true"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/);
    assert.ok(arc, "progress arc");
    assert.ok(Math.abs(Number(arc[1]) / Number(arc[2]) - 0.5) < 0.001);
  });

  it("draws no arc for a locked badge with no progress", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tier: "bronze", category: "limited", locked: true }));
    assert.doesNotMatch(html, /data-ring/);
    assert.match(html, /#A1A1AA/);
  });

  it("animates only an earned Legendary badge", () => {
    const legendary = renderToStaticMarkup(createElement(Badge, { tier: "legendary", category: "collector" }));
    assert.match(legendary, /badge-aura/);
    assert.match(legendary, /badge-shine/);
    const still = renderToStaticMarkup(
      createElement(Badge, { tier: "legendary", category: "collector", animate: false }),
    );
    assert.doesNotMatch(still, /badge-aura/);
    const locked = renderToStaticMarkup(
      createElement(Badge, { tier: "legendary", category: "collector", locked: true }),
    );
    assert.doesNotMatch(locked, /badge-aura/);
  });

  it("uses no green or red in badge UI", () => {
    const files = [
      "components/badges/badge.tsx",
      "components/badges/badge-reveal.tsx",
      "components/badges/achievements-view.tsx",
      "components/badges/profile-badge-strip.tsx",
      "app/(app)/u/[username]/badges/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /\b(?:text|bg|border|ring|fill|stroke)-(?:red|rose|green|emerald|lime)-/, file);
    }
  });
});

describe("reduced motion", () => {
  it("stops the Legendary loop and the reveal motion in CSS", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(
      (match) => match[1],
    );
    const badgeBlock = blocks.find((block) => block.includes(".badge-aura"));
    assert.ok(badgeBlock, "reduced-motion block for badges");
    for (const name of [".badge-aura", ".badge-shine", ".badge-reveal-in", ".badge-reveal-copy", ".badge-reveal-sheen"]) {
      assert.ok(badgeBlock.includes(name), name);
    }
    assert.match(badgeBlock, /animation: none/);
  });

  it("scales the reveal in with a shine by default", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
    const badge = document.querySelector("[data-reveal-badge]");
    assert.ok(badge?.classList.contains("badge-reveal-in"));
    assert.ok(document.querySelector(".badge-reveal-sheen"));
    assert.equal(document.querySelector("[role='dialog'] h2")?.textContent, "Legendary Collector unlocked");
  });

  it("shows the reveal without scale or shine for reduced motion", () => {
    state.reducedMotion = true;
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
    const badge = document.querySelector("[data-reveal-badge]");
    assert.ok(badge);
    assert.equal(badge.classList.contains("badge-reveal-in"), false);
    assert.equal(document.querySelector(".badge-reveal-sheen"), null);
    assert.equal(document.querySelector(".badge-reveal-copy"), null);
  });
});

describe("earn reveal", () => {
  it("lists the other badges and offers Pin to profile and Nice", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
    const text = document.body.textContent ?? "";
    assert.match(text, /Also earned/);
    assert.match(text, /Gold Streak/);
    const buttons = [...document.querySelectorAll("button")].map((button) => button.textContent);
    assert.deepEqual(buttons, ["Pin to profile", "Nice"]);
    assert.equal(document.activeElement?.textContent, "Nice");
  });

  it("says pinned when the badge already shows on the profile", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: ["collector:legendary"], onClose() {} }));
    assert.ok([...document.querySelectorAll("button")].some((button) => button.textContent === "Pinned to profile"));
  });

  it("closes on Nice", () => {
    let closed = 0;
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose: () => (closed += 1) }));
    const nice = [...document.querySelectorAll("button")].find((button) => button.textContent === "Nice");
    act(() => nice!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(closed, 1);
  });
});

describe("earn reveal share", () => {
  it("puts Share next to Pin to profile for the owner", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], username: "democollector", onClose() {} }));
    const buttons = [...document.querySelectorAll("button")].map((button) => button.textContent);
    assert.deepEqual(buttons, ["Pin to profile", "Share", "Nice"]);
  });

  it("opens the share sheet with the badge link when there is no native share", async () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], username: "democollector", onClose() {} }));
    const share = [...document.querySelectorAll("button")].find((button) => button.textContent === "Share");
    await act(async () => {
      share!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const sheet = [...document.querySelectorAll("[role='dialog']")].find((node) => node.textContent?.includes("Post on X"));
    assert.ok(sheet, "share sheet");
    const x = sheet.querySelector<HTMLAnchorElement>("a[target='_blank']");
    const intent = new URL(x!.getAttribute("href")!);
    assert.equal(intent.origin + intent.pathname, "https://x.com/intent/post");
    assert.equal(intent.searchParams.get("text"), "Just unlocked Legendary Collector on Slabhold");
    assert.match(intent.searchParams.get("url") ?? "", /\/u\/democollector\/badges\/collector\/legendary\?ref=share$/);
    const save = [...sheet.querySelectorAll("a")].find((link) => link.textContent?.includes("Save image"));
    assert.equal(save?.getAttribute("href"), "/api/share-image/badge/democollector/collector/legendary");
    assert.ok([...sheet.querySelectorAll("button")].some((button) => button.textContent === "Copy link"));
  });
});

describe("profile strip", () => {
  it("renders nothing when badges are hidden", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileBadgeStrip, { view: { kind: "hidden" }, badgesHref: "/u/maya/badges" }),
    );
    assert.equal(html, "");
  });

  it("shows pins with captions and a +N chip to the badges page", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileBadgeStrip, {
        view: {
          kind: "strip",
          pins: [
            { category: "collector", tier: "legendary" },
            { category: "streak", tier: "diamond" },
            { category: "slab-king", tier: "gold" },
          ],
          more: 5,
        },
        badgesHref: "/u/maya/badges",
      }),
    );
    assert.equal((html.match(/data-badge=/g) ?? []).length, 3);
    assert.match(html, />Collector</);
    assert.match(html, />Legendary</);
    assert.match(html, /\+5/);
    assert.match(html, /href="\/u\/maya\/badges"/);
    assert.match(html, /badge-aura/);
  });

  it("shows the slim first-badge line with a mini ring", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileBadgeStrip, {
        view: { kind: "first", line: "Earn your first badge: add 10 cards", progress: 0.3 },
        badgesHref: "/u/maya/badges",
      }),
    );
    assert.match(html, /Earn your first badge: add 10 cards/);
    assert.match(html, /data-ring/);
  });
});
