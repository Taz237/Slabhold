import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostPageSkeleton } from "@/components/post-skeleton";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a tapped post or profile never sits frozen", () => {
  it("gives the post page and both profile pages a loading screen in their own shape", () => {
    assert.match(read("app/(app)/posts/[id]/loading.tsx"), /PostPageSkeleton/);
    assert.match(read("app/(app)/u/[username]/loading.tsx"), /ProfileRouteLoading/);
    assert.match(read("app/(app)/profile/loading.tsx"), /ProfileRouteLoading/);
    // The loading file covers the pages under a profile too. Each gets its own shape.
    const loading = read("components/profile-route-loading.tsx");
    assert.match(loading, /ProfileSkeleton/);
    assert.match(loading, /CollectionSkeleton/);
    assert.match(loading, /LoadingRows/);
  });

  it("draws the post skeleton with the page's own header row and a post under it", () => {
    const html = renderToStaticMarkup(createElement(PostPageSkeleton));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Loading post/);
    assert.match(html, /data-post-skeleton/);
    assert.doesNotMatch(html, /animate-pulse|animate-spin/);
  });

  it("uses that skeleton while the post page reads its post", () => {
    const view = read("components/post-view.tsx");
    assert.match(view, /if \(!ready \|\| \(loadingPost && !post\)\) return <PostPageSkeleton \/>;/);
  });

  it("keeps a missing post or profile a real 404 for a full page load", () => {
    // The proxy answers 404 before any loading screen streams.
    assert.match(read("proxy.ts"), /pathIsMissing/);
    assert.equal(existsSync(join(process.cwd(), "lib/social/missing-route.ts")), true);
  });
});

describe("back arrows", () => {
  it("go back in history, so the screen behind keeps its scroll", () => {
    for (const file of [
      "components/card-posts-list.tsx",
      "components/card-detail-shell.tsx",
      "components/public-card-view.tsx",
      "components/moving-today-page.tsx",
    ]) {
      assert.match(read(file), /onClick=\{\(event\) => backLinkClick\(event, [^)]+\)\}/, file);
    }
    assert.match(read("components/message-thread.tsx"), /goBack\(\{ to: "\/messages", push: \(href\) => router\.push\(href\) \}\)/);
    assert.match(read("components/follow-list.tsx"), /goBack\(\{ to: backHref, push: \(href\) => router\.push\(href\) \}\)/);
  });

  it("the post page's arrow goes Home when the post was opened cold", () => {
    assert.match(read("components/post-view.tsx"), /goBack\(\{ push: \(\) => router\.push\("\/"\) \}\)/);
  });

  it("slide back, not forward, on the privacy lists and the badges page", () => {
    assert.match(read("components/privacy-lists.tsx"), /data-nav-back=""/);
    assert.match(read("app/(app)/u/[username]/badges/page.tsx"), /data-nav-back=""/);
  });

  it("someone else's profile has a back arrow, yours does not", () => {
    const view = read("components/profile-view.tsx");
    assert.match(view, /\{!isOwn \? \(\s*<button[\s\S]{0,200}?aria-label="Back"/);
  });

  it("treats the history move as a Back even where a link was tapped", () => {
    const nav = read("components/nav-motion.tsx");
    assert.match(nav, /forcedBack \? "traverse"/);
  });
});

describe("tabs", () => {
  it("come back to the spot you left when tapped from the bar", () => {
    const nav = read("components/nav-motion.tsx");
    assert.match(nav, /arrivalScroll\(\{/);
    assert.match(nav, /closest\("\[data-app-chrome\]"\)/);
    // Where the browser reports the navigation itself, the tap's own notes survive it.
    assert.match(nav, /back: tapped\?\.back,\s+tab: tapped\?\.tab,/);
  });

  it("the logo scrolls Home to the top like the Home tab, and never animates with Reduce Motion", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /aria-label="Slabhold home"\s+onClick=\{\(event\) => onTabClick\(event, "\/"\)\}/);
    assert.match(shell, /behavior: reducedMotion\(\) \? "auto" : "smooth"/);
    assert.doesNotMatch(shell, /scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  });
});
