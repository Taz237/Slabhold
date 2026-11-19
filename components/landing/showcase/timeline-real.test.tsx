import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { FIXTURE_COMP, FIXTURE_FOUNDER, FIXTURE_PULLS, htmlWords, withLandingContexts } from "@/lib/test/landing-fixtures";

installDom();

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/*
 * The landing page used to play a timeline and a leaderboard of made-up
 * accounts with generated avatars. Both are gone: real cards and real pulls
 * only. These pins keep them gone.
 */
describe("timeline and leaderboard demos are off the landing page", () => {
  async function landing() {
    const { LandingPage } = await import("@/components/landing-page");
    return renderToStaticMarkup(
      withLandingContexts(createElement(LandingPage, { founder: FIXTURE_FOUNDER, comp: FIXTURE_COMP, pulls: FIXTURE_PULLS, media: EMPTY_MEDIA })),
    );
  }

  it("draws no made-up account: no persona name, handle or avatar", async () => {
    const html = await landing();
    const { PERSONAS } = await import("@/components/landing/showcase/sample-data");
    for (const persona of Object.values(PERSONAS)) {
      assert.ok(!html.includes(persona.handle), persona.handle);
      assert.ok(!html.includes(persona.name), persona.name);
    }
    assert.doesNotMatch(html, /\/landing\/avatars\//);
    assert.doesNotMatch(htmlWords(html), /Sample accounts|not real collectors|Collectors talking cards|Weekly leaderboards/);
    assert.doesNotMatch(html, /data-post=|data-place=|data-real-pickup/);
  });

  it("shows only handles the pulls list approved", async () => {
    const html = await landing();
    const handles = [...htmlWords(html).matchAll(/@([a-z0-9_]+)/g)].map((match) => match[1]);
    assert.ok(handles.length > 0);
    for (const handle of handles) assert.ok(FIXTURE_PULLS.some((pull) => pull.handle === handle), handle);
  });

  it("no landing source reaches for the personas, the avatars or the old demos", () => {
    const files = readdirSync(join(ROOT, "components/landing"))
      .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
      .map((name) => `components/landing/${name}`);
    for (const file of [...files, "components/landing-page.tsx", "app/welcome/page.tsx", "app/(app)/page.tsx"]) {
      assert.doesNotMatch(read(file), /avatarSrc|PERSONAS|SAMPLE_POSTS|SAMPLE_BOARD|landing\/avatars|timeline-demo|leaderboard-demo|LandingPickupContext/, file);
    }
    for (const gone of ["timeline-demo.tsx", "leaderboard-demo.tsx"]) {
      assert.equal(existsSync(join(ROOT, "components/landing/showcase", gone)), false, gone);
    }
  });

  it("the comp provider carries one thing now: the real card for Quick Comp", async () => {
    const { LandingCompProvider, LandingCompContext } = await import("@/components/landing/landing-links");
    const { use } = await import("react");
    let seen: unknown = "unset";
    function Probe() {
      seen = use(LandingCompContext);
      return null;
    }
    renderToStaticMarkup(createElement(LandingCompProvider, { comp: FIXTURE_COMP }, createElement(Probe)));
    assert.deepEqual(seen, FIXTURE_COMP);
    renderToStaticMarkup(createElement(LandingCompProvider, { comp: null }, createElement(Probe)));
    assert.equal(seen, null);
  });
});
