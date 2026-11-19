import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { EMPTY_MEDIA, MEDIA_FILES, STILL_SIZE, VIDEO_SIZE, landingMedia } from "@/lib/landing/media";
import { ALL_MEDIA_FILES, mediaRoot } from "@/lib/test/landing-fixtures";

const ROOT = process.cwd();
const DIR = join(ROOT, "public/landing/media");

describe("landing media slots", () => {
  it("ships no media in phase 1: only the README, so every slot is empty", () => {
    assert.deepEqual(readdirSync(DIR).sort(), ["README.md"]);
    assert.deepEqual(landingMedia(), EMPTY_MEDIA);
    for (const slot of Object.values(landingMedia())) {
      if (slot && typeof slot === "object" && "alt" in slot) continue;
      assert.equal(slot, null);
    }
  });

  it("is empty when the folder isn't there at all", () => {
    assert.deepEqual(landingMedia(join(ROOT, "no-such-root")), EMPTY_MEDIA);
  });

  it("fills each slot from its exact file name, with the default sizes", () => {
    const fixture = mediaRoot(ALL_MEDIA_FILES);
    try {
      const media = fixture.media();
      assert.deepEqual(media.heroCard, { src: "/landing/media/hero-card.avif", poster: null, ...STILL_SIZE });
      assert.deepEqual(media.heroCardBack, { src: "/landing/media/hero-card-back.avif", poster: null, ...STILL_SIZE });
      assert.deepEqual(media.serialMacro, { src: "/landing/media/serial-macro.avif", poster: null, ...STILL_SIZE });
      assert.deepEqual(media.shareRank, { src: "/landing/media/share-rank.webp", poster: null, ...STILL_SIZE });
      for (const slot of ["scan", "serial", "parallels", "collection", "arena"] as const) {
        assert.deepEqual(media[slot], { src: `/landing/media/${slot}.mp4`, poster: `/landing/media/${slot}.webp`, ...VIDEO_SIZE }, slot);
      }
      assert.deepEqual(VIDEO_SIZE, { width: 720, height: 1560 });
      assert.deepEqual(STILL_SIZE, { width: 1280, height: 1792 });
      assert.equal(media.pulls, null, "no pulls.json");
    } finally {
      fixture.remove();
    }
  });

  it("counts a clip without its poster, or a poster without its clip, as empty", () => {
    const fixture = mediaRoot(["scan.mp4", "arena.webp", "hero-card-back.avif"]);
    try {
      const media = fixture.media();
      assert.equal(media.scan, null);
      assert.equal(media.arena, null);
      assert.equal(media.heroCardBack, null, "a back with no front is not a hero card");
    } finally {
      fixture.remove();
    }
  });

  it("takes sizes, the alt text and the serial from sizes.json, and ignores junk in it", () => {
    const fixture = mediaRoot(["hero-card.avif", "scan.mp4", "scan.webp", "arena.mp4", "arena.webp"], {
      "sizes.json": {
        "scan.mp4": { width: 608, height: 1080 },
        "arena.mp4": { width: -4, height: "tall" },
        "hero-card.avif": { width: 1000, height: 1400, alt: "  A fixture card  ", serial: "06/10" },
      },
    });
    try {
      const media = fixture.media();
      assert.deepEqual([media.scan?.width, media.scan?.height], [608, 1080]);
      assert.deepEqual([media.arena?.width, media.arena?.height], [720, 1560], "bad numbers fall back to the default");
      assert.deepEqual([media.heroCard?.width, media.heroCard?.height], [1000, 1400]);
      assert.deepEqual(media.heroCardFacts, { alt: "A fixture card", serial: "06/10" });
    } finally {
      fixture.remove();
    }
    const broken = mediaRoot(["scan.mp4", "scan.webp", "sizes.json"]);
    try {
      assert.deepEqual([broken.media().scan?.width, broken.media().scan?.height], [720, 1560]);
    } finally {
      broken.remove();
    }
  });

  it("reads pulls.json as handle and card id pairs only", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const fixture = mediaRoot([], {
      "pulls.json": [
        { handle: "fixture_puller", cardId: id, note: "dropped" },
        { handle: "../etc", cardId: id },
        { handle: "ok_handle", cardId: "not an id" },
        "junk",
        null,
      ],
    });
    try {
      assert.deepEqual(fixture.media().pulls, [{ handle: "fixture_puller", cardId: id }]);
    } finally {
      fixture.remove();
    }
    const none = mediaRoot([], { "pulls.json": [] });
    try {
      assert.equal(none.media().pulls, null, "an empty list is no wall");
    } finally {
      none.remove();
    }
  });

  it("documents every slot's exact file name and the encoding", () => {
    const readme = readFileSync(join(DIR, "README.md"), "utf8");
    for (const name of Object.values(MEDIA_FILES)) assert.ok(readme.includes(`\`${name}\``), name);
    for (const word of ["H.264", "yuv420p", "720 wide", "30 fps", "-crf 28", "+faststart", "-an", "1.5 MB", "quality 70", "540 wide", "40 KB", "AVIF", "1280 wide"]) {
      assert.ok(readme.includes(word), word);
    }
    assert.doesNotMatch(readme, /\bfree\b|\bbest\b|\bAI\b/i);
  });

  it("looks only on the server, and its files travel with the two routes that draw the page", () => {
    const source = readFileSync(join(ROOT, "lib/landing/media.ts"), "utf8");
    assert.match(source, /from "node:fs"/);
    assert.doesNotMatch(source, /"use client"|fetch\(/);
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    assert.match(config, /outputFileTracingIncludes: \{\s*"\/": \["public\/landing\/media\/\*\*"\],\s*"\/welcome": \["public\/landing\/media\/\*\*"\],/);
    assert.equal(existsSync(join(ROOT, "public/landing/sample-raw-card.svg")), false);
  });
});
