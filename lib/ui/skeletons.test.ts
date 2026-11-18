import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = process.cwd();

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("loading placeholders", () => {
  it("all use the one shimmer, never a bare pulse", () => {
    const pulsing = [...sources("app"), ...sources("components")].filter((path) => /animate-pulse/.test(read(path)));
    assert.deepEqual(pulsing, []);
  });

  it("stay a still gray block with Reduce Motion on", () => {
    const css = read("app/globals.css");
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.skeleton-shimmer \{([^}]*)\}/);
    assert.ok(reduced, "a reduced-motion rule for .skeleton-shimmer");
    assert.match(reduced[1], /animation:\s*none/);
    assert.match(reduced[1], /background-image:\s*none/);
    assert.match(css, /\.skeleton-shimmer \{[^}]*background-color:/);
  });

  it("never stand in a lone line of Loading text", () => {
    for (const path of [
      "app/(app)/leaderboard/value/loading.tsx",
      "components/collect-settings.tsx",
      "components/collect-editor.tsx",
      "components/public-card-view.tsx",
    ]) {
      assert.doesNotMatch(read(path), /<p[^>]*>\s*(\{[^}]*\?\s*)?"?Loading[^<]*<\/p>/, path);
      assert.doesNotMatch(read(path), /: "Loading sold prices…"/, path);
    }
  });

  it("draws the value board's shape while it loads", async () => {
    const { default: Loading } = await import("@/app/(app)/leaderboard/value/loading");
    const html = renderToStaticMarkup(createElement(Loading));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Loading the value board/);
    assert.ok((html.match(/skeleton-shimmer/g) ?? []).length >= 8);
  });

  it("draws the collecting settings' shape while they load", async () => {
    const { CollectSettingsSkeleton } = await import("@/components/collect-settings-skeleton");
    const html = renderToStaticMarkup(createElement(CollectSettingsSkeleton));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /What you collect/);
    assert.ok((html.match(/skeleton-shimmer/g) ?? []).length >= 6);
  });
});

describe("signed-in pages before the session loads", () => {
  it("draw the page's own skeleton, not a blank screen", async () => {
    const { PendingRouteSkeleton } = await import("@/components/pending-route-skeleton");
    const html = (pathname: string) => renderToStaticMarkup(createElement(PendingRouteSkeleton, { pathname }));
    assert.match(html("/profile"), /Loading profile/);
    assert.match(html("/collection"), /Loading collection/);
    assert.match(html("/notifications"), /Loading notifications/);
    assert.match(html("/settings/collecting"), /Loading/);
    for (const path of ["/profile", "/collection", "/notifications", "/settings/collecting"]) {
      assert.match(html(path), /data-pending-route-skeleton=""/);
      assert.match(html(path), /skeleton-shimmer/);
    }
  });

  it("show only when the session hint says someone is signed in", () => {
    const css = read("app/globals.css");
    assert.match(css, /\[data-pending-route-skeleton\] \{\s*display: none;/);
    assert.match(css, /html\[data-session\] \[data-pending-route-skeleton\] \{\s*display: block;/);
  });

  it("stay off pages that are not account pages", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /requiresAccount\(pathname\) \? <PendingRouteSkeleton pathname=\{pathname\} \/>/);
  });
});
