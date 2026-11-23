import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { installDom } from "@/lib/test/dom";

installDom();

const ROOT = process.cwd();
function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function sources(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
}

const SHOWCASE = sources("components/landing/showcase");

const INTRO = sources("components/onboarding/intro");
const ALL = [...SHOWCASE, ...INTRO, "components/landing/sections.tsx", "components/landing/landing-timeline.tsx", "components/landing/screen-clip.tsx"];

const personasDoc = read("public/landing/avatars/personas.md");
const personaRows = new Map(
  [...personasDoc.matchAll(/^\| @([a-z0-9_]+) \| ([^|]+?) \|/gm)].map((match) => [match[1], match[2].trim()]),
);

describe("landing showcase and intro sources", () => {
  it("make no made-up claims, don't sell, and keep \"free\" off the visuals", () => {
    for (const file of ALL) {
      const source = read(file);
      assert.doesNotMatch(source, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i, file);
      assert.doesNotMatch(source, /join (thousands|\d)/i, file);
      assert.doesNotMatch(source, /marketplace|buy now|for sale|sell your/i, file);
      assert.doesNotMatch(source, /pok[eé]mon|tcg|mail day/i, file);
      assert.doesNotMatch(source, /eBay data|eBay logo/i, file);
    }
    // The demos and the intro's visuals are pictures of the app: no "free" drawn in them.
    for (const file of [...SHOWCASE, ...INTRO]) assert.doesNotMatch(read(file), /\bfree\b/i, file);
  });

  it("never fetch or call an API: static sample data only", () => {
    for (const file of ALL) {
      const source = read(file);
      assert.doesNotMatch(source, /\bfetch\(/, file);
      assert.doesNotMatch(source, /\/api\//, file);
      assert.doesNotMatch(source, /trawl\.dev|from "@\/lib\/comps\/(trawl|index)"/, file);
    }
  });

  it("gives every Link prefetch={false} and never links a persona", () => {
    for (const file of ALL) {
      const source = read(file);
      for (const match of source.matchAll(/<Link\b[^>]*>/g)) assert.match(match[0], /prefetch=\{false\}/, file);
      assert.doesNotMatch(source, /\/u\/\$\{|userHref|FollowButton/, file);
    }
  });

  it("uses only the zip's avatars, untouched, and only personas from personas.md", async () => {
    const files = readdirSync(join(ROOT, "public/landing/avatars")).sort();
    assert.deepEqual(files, [
      "diegos_gridiron_pc.webp",
      "femi_matchday.webp",
      "kitchentable_pc.webp",
      "loupe_and_labels.webp",
      "minh_rookieroom.webp",
      "paolo_lolocards.webp",
      "personas.md",
      "rinkside_andre.webp",
      "sami_rookiehunt.webp",
    ]);
    const { PERSONAS, SAMPLE_POSTS, SAMPLE_ALERTS, avatarSrc } = await import("@/components/landing/showcase/sample-data");
    for (const persona of Object.values(PERSONAS)) {
      assert.equal(personaRows.get(persona.handle), persona.name, persona.handle);
      assert.ok(existsSync(join(ROOT, "public", avatarSrc(persona))), persona.handle);
      assert.match(avatarSrc(persona), /^\/landing\/avatars\/[a-z0-9_]+\.webp$/);
    }
    for (const item of [...SAMPLE_POSTS, ...SAMPLE_ALERTS]) assert.ok(personaRows.has(item.persona.handle));
    for (const file of [...SHOWCASE, ...INTRO]) assert.doesNotMatch(read(file), /next\/image|avif/i, file);
    // The personas are onboarding's only: the landing page draws none of them.
    for (const file of sources("components/landing")) assert.doesNotMatch(read(file), /avatarSrc|PERSONAS|landing\/avatars/, file);
  });
});

describe("landing chapters", () => {
  it("are gone, and so is Quick Comp: the showcase folder holds only onboarding's motion helpers and shared shapes", () => {
    assert.deepEqual(SHOWCASE.sort(), ["components/landing/showcase/motion.ts", "components/landing/showcase/sample-data.ts"]);
    assert.equal(existsSync(join(ROOT, "components/landing/feature-panels.tsx")), false);
    assert.equal(existsSync(join(ROOT, "components/landing/quick-comp-section.tsx")), false);
  });

  it("keeps the real card photo for onboarding's kitchen-table pickup only, as a plain lazy image", () => {
    assert.ok(existsSync(join(ROOT, "public/landing/kitchen-table-card.webp")));
    const photo = readFileSync(join(ROOT, "public/landing/kitchen-table-card.webp"));
    assert.equal(photo.subarray(8, 12).toString(), "WEBP");
    const source = read("components/onboarding/intro/screens.tsx");
    assert.match(source, /src="\/landing\/kitchen-table-card\.webp"/);
    assert.doesNotMatch(source, /kitchen-table-card[^"]*\.(avif|png|jpe?g)|next\/image/);
    assert.match(source, /kitchen-table-card\.webp"[^>]*className="aspect-\[5\/7\] w-11/);
    for (const file of sources("components/landing")) assert.doesNotMatch(read(file), /kitchen-table-card/, file);
  });
});

describe("landing assets", () => {
  it("drops the old screenshots, 2.png with its sample screen included", () => {
    for (const name of ["1.png", "2.png", "3.png", "sample-raw-card.svg"]) {
      assert.equal(existsSync(join(ROOT, "public/landing", name)), false, name);
    }
    for (const file of ["components/og-frame.tsx", "next.config.ts", "app/layout.tsx", "lib/social/share-image.ts"]) {
      assert.doesNotMatch(read(file), /landing\/(1|2|3)\.png|"2\.png"/, file);
    }
  });
});
