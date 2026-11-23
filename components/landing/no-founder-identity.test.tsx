import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";

installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

/** The founder's name, handle, surname and the founder/creator wording. */
const IDENTITY = /donnietaz|\bDonnie\b|Taziole|\bfounder\b|\bcreator\b|Built by @|From @/i;

const STORAGE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public";
process.env.NEXT_PUBLIC_SUPABASE_URL = new URL(STORAGE).origin;

function post(id: string, user: string, at: string) {
  return {
    id,
    user_id: user,
    content: `Post ${id}`,
    image_url: `${STORAGE}/post-images/${user}/${id}.jpg`,
    card: null,
    quoted_post_id: null,
    created_at: at,
    hidden_at: null,
    post_type: "post",
  };
}

function files(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return files(path);
    return /\.(tsx?|md|json|webmanifest|txt)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("logged-out surfaces carry no founder identity", () => {
  it("the landing timeline never names the founder: the team account's posts stay off it", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const posts = landingTimeline(
      [post("team", "f1", "2026-11-21T10:00:00Z"), post("other", "u2", "2026-11-20T10:00:00Z")],
      [
        { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: `${STORAGE}/avatars/f1/donnie.png` },
        { id: "u2", username: "fixture_collector", display_name: "Fixture Collector", avatar_url: null },
      ],
      [],
    );
    assert.deepEqual(posts.map((item) => item.handle), ["fixture_collector"]);
    assert.doesNotMatch(JSON.stringify(posts), /donnietaz|Donnie/i);
    const { LandingPage } = await import("@/components/landing-page");
    const { EMPTY_MEDIA } = await import("@/lib/landing/media");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, createElement(LandingPage, { posts, media: EMPTY_MEDIA })),
      ),
    );
    assert.match(html, /data-landing-post="other"/, "the real post stays");
    assert.doesNotMatch(text(html), IDENTITY);
    assert.doesNotMatch(html, /donnietaz|Donnie/i);
  });

  it("the page with its real hero card names no one", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, createElement(LandingPage)),
      ),
    );
    assert.match(html, /data-hero-card="real"/);
    assert.doesNotMatch(text(html), IDENTITY);
    assert.doesNotMatch(html, /donnietaz|Donnie/i);
  });

  it("the server showcase never carries the handle, name or avatar", async () => {
    const { founderShowcase } = await import("@/lib/landing/founder");
    const showcase = founderShowcase(
      { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: "https://cdn.example/a.png" },
      [],
    );
    assert.doesNotMatch(JSON.stringify(showcase), /donnietaz|Donnie|a\.png/);
  });

  it("About, Help, Terms, Privacy, Support, metadata, manifest and share images", () => {
    const pages = [
      "app/(app)/about/page.tsx",
      "app/(app)/terms/page.tsx",
      "app/(app)/privacy/page.tsx",
      "app/(app)/support/page.tsx",
      "app/(app)/login/page.tsx",
      "app/(app)/signup/page.tsx",
      "app/layout.tsx",
      "app/manifest.ts",
      "app/opengraph-image.tsx",
      "app/twitter-image.tsx",
      "app/welcome/page.tsx",
      "components/og-frame.tsx",
      "components/landing-page.tsx",
    ];
    for (const path of pages) {
      // Comments, imports and variable names may say "founder" about the data
      // source. Strings and JSX text, what a visitor can see, may not.
      const drawn = read(path)
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
        .replace(/^import .*$/gm, "");
      assert.doesNotMatch(drawn, /donnietaz|\bDonnie\b|Taziole|Built by @|From @/i, path);
      assert.doesNotMatch(drawn, /["'`>][^"'`<>\n]*\b(founder|creator)\b[^"'`<>\n]*["'`<]/i, path);
    }
  });

  it("nothing public under public/ or the landing components names him", () => {
    for (const path of [...files("public"), ...files("components/landing"), ...files("components/onboarding")]) {
      assert.doesNotMatch(read(path), /donnietaz|\bDonnie\b|Taziole/i, path);
    }
    for (const path of files("components/landing")) {
      assert.doesNotMatch(read(path), /From @\$?\{?owner|From the founder|Follow on Slabhold/, path);
    }
  });
});
