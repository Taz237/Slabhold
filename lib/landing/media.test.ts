import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CLIP_KEYS, EMPTY_MEDIA, SCREEN_FILES, SCREEN_SIZE, landingMedia, type ScreenKey } from "@/lib/landing/media";
import { ALL_SCREEN_FILES, mediaRoot } from "@/lib/test/landing-fixtures";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const KEYS = Object.keys(SCREEN_FILES) as ScreenKey[];

describe("landing media slots", () => {
  it("commits no screenshot or clip stand-ins: only the README, until real files are added", () => {
    const allowed = new Set(["README.md", ...ALL_SCREEN_FILES, ...ALL_SCREEN_FILES.map((name) => name.replace(/\.png$/, ".webp")), ...CLIP_KEYS.map((key) => SCREEN_FILES[key].replace(/\.png$/, ".mp4"))]);
    for (const name of readdirSync(join(ROOT, "public/landing/screens"))) assert.ok(allowed.has(name), `${name} is not a slot file`);
    assert.ok(existsSync(join(ROOT, "public/landing/screens/README.md")));
    assert.equal(existsSync(join(ROOT, "public/landing/media")), false, "the old media folder is gone");
  });

  it("uses the exact file names", () => {
    assert.deepEqual(SCREEN_FILES, {
      homeForYou: "home-for-you.png",
      homePost: "home-post.png",
      profileCards: "profile-cards.png",
      scanCamera: "scan-camera.png",
      scanReveal: "scan-reveal.png",
      cardSales: "card-sales.png",
      scanSales: "scan-sales.png",
      catalogFeed: "catalog-feed.png",
      collectionGrid: "collection-grid.png",
      collectionValue: "collection-value.png",
      leaderboard: "leaderboard.png",
      invite: "invite.png",
    });
    assert.deepEqual([...CLIP_KEYS].sort(), ["cardSales", "catalogFeed", "collectionValue", "homeForYou", "profileCards", "scanReveal"]);
  });

  it("every slot is empty with no files, and with no public folder at all", () => {
    const fixture = mediaRoot([]);
    try {
      assert.deepEqual(fixture.media(), EMPTY_MEDIA);
      assert.deepEqual(landingMedia(join(fixture.root, "nowhere")), EMPTY_MEDIA);
      for (const key of KEYS) assert.equal(EMPTY_MEDIA.screens[key], null, key);
      assert.equal(EMPTY_MEDIA.heroCard, null);
    } finally {
      fixture.remove();
    }
  });

  it("fills a slot only when its file exists, at the file's own size", () => {
    const fixture = mediaRoot(["scan-reveal.png", "leaderboard.png"], { hero: true });
    try {
      const media = fixture.media();
      assert.deepEqual(media.screens.scanReveal, { src: "/landing/screens/scan-reveal.png", width: 1170, height: 2532, video: null });
      assert.deepEqual(media.screens.leaderboard, { src: "/landing/screens/leaderboard.png", width: 1170, height: 2532, video: null });
      for (const key of KEYS.filter((key) => key !== "scanReveal" && key !== "leaderboard")) assert.equal(media.screens[key], null, key);
      assert.equal(media.heroCard?.src, "/landing/hero-card.jpg");
    } finally {
      fixture.remove();
    }
  });

  it("takes a .webp of the same name, and falls back to an iPhone's size when a file's size can't be read", () => {
    const fixture = mediaRoot(["invite.webp"]);
    try {
      assert.deepEqual(fixture.media().screens.invite, { src: "/landing/screens/invite.webp", ...SCREEN_SIZE, video: null });
    } finally {
      fixture.remove();
    }
  });

  it("plays a recording only in the six clip slots, and only with its .png poster beside it", () => {
    const fixture = mediaRoot(["profile-cards.png", "profile-cards.mp4", "catalog-feed.mp4", "leaderboard.png", "leaderboard.mp4", "invite.png", "invite.mp4"]);
    try {
      const { screens } = fixture.media();
      assert.equal(screens.profileCards?.video, "/landing/screens/profile-cards.mp4");
      assert.equal(screens.profileCards?.src, "/landing/screens/profile-cards.png");
      assert.equal(screens.catalogFeed, null, "a recording with no poster is an empty slot");
      assert.equal(screens.leaderboard?.video, null, "the leaderboard stays a still");
      assert.equal(screens.invite?.video, null, "the invite stays a still");
    } finally {
      fixture.remove();
    }
  });

  it("looks only on the server, and its files travel with the two routes that draw the page", () => {
    const media = read("lib/landing/media.ts");
    assert.match(media, /from "node:fs"/);
    assert.doesNotMatch(media, /^"use client";/m);
    const config = read("next.config.ts");
    assert.match(config, /"\/": \["public\/landing\/screens\/\*\*", "public\/landing\/hero-card\.jpg"\]/);
    assert.match(config, /"\/welcome": \["public\/landing\/screens\/\*\*", "public\/landing\/hero-card\.jpg"\]/);
  });

  it("documents every slot's exact file name and the rules for a screenshot", () => {
    const readme = read("public/landing/screens/README.md");
    for (const name of ALL_SCREEN_FILES) assert.ok(readme.includes(`\`${name}\``), name);
    for (const key of CLIP_KEYS) assert.ok(readme.includes(SCREEN_FILES[key].replace(/\.png$/, ".mp4")), key);
    for (const rule of [/Dark mode/, /current app/, /iPhone screenshot/, /Do Not Disturb on/, /No old app UI/i, /No casual table photos/i, /PNG or WebP/, /at least 1170px/, /720/]) {
      assert.match(readme, rule);
    }
  });
});
