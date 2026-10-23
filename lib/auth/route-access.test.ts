import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { pathIsMissing } from "../social/missing-route";
import { isStaticPublicPath, requiresAccount, routeAccess } from "./route-access";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

describe("route access", () => {
  it("lets signed-out visitors open public pages", () => {
    const paths = [
      "/",
      "/home",
      "/about",
      "/privacy",
      "/terms",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/search",
      "/search?q=wemby",
      "/moving-today",
      `/posts/${CARD}`,
      "/u/maya",
      "/u/maya/followers",
      "/u/maya/following",
      `/u/maya/cards/${CARD}`,
      `/cards/${CARD}/posts`,
    ];
    for (const path of paths) {
      assert.equal(routeAccess(path), "public", path);
      assert.equal(requiresAccount(path), false, path);
    }
  });

  it("sends only account pages to signup", () => {
    const paths = [
      "/collection",
      "/collection/",
      "/portfolio",
      "/cards/new",
      `/cards/${CARD}`,
      `/cards/${CARD}/edit`,
      "/compose",
      "/scan",
      "/messages",
      "/messages/maya",
      "/notifications",
      "/more",
      "/profile",
      "/profile/followers",
      "/profile/following",
      "/settings",
      "/settings/privacy",
      "/settings/collecting",
    ];
    for (const path of paths) {
      assert.equal(routeAccess(path), "account", path);
      assert.equal(requiresAccount(path), true, path);
    }
  });

  it("leaves unknown URLs and notFound routes alone", () => {
    const paths = [
      "/zz-nonsense-xyz",
      "/explore",
      "/admin/reports",
      "/admin/comp-flags",
      "/404",
      "/posts",
      "/u",
      "/cards",
      "/no/such/page",
    ];
    for (const path of paths) {
      assert.equal(routeAccess(path), "unknown", path);
      assert.equal(requiresAccount(path), false, path);
    }
  });

  it("sends retired Mail Day links to Add card instead of a 404", () => {
    for (const path of ["/mail-day", "/mail-day/", "/mail-day/extra", "/mail-day/a/b"]) {
      assert.equal(routeAccess(path), "public", path);
      assert.equal(requiresAccount(path), false, path);
      assert.notEqual(routeAccess(path), "unknown", path);
    }
    assert.equal(routeAccess("/cards/new"), "account");
    assert.equal(requiresAccount("/cards/new"), true);

    const root = process.cwd();
    const config = readFileSync(join(root, "next.config.ts"), "utf8");
    const page = readFileSync(join(root, "app/mail-day/page.tsx"), "utf8");
    assert.match(config, /source:\s*"\/mail-day"/);
    assert.match(config, /source:\s*"\/mail-day\/:path\*"/);
    assert.match(config, /destination:\s*"\/cards\/new"/);
    assert.equal((config.match(/destination:\s*"\/cards\/new"/g) ?? []).length, 2);
    assert.match(page, /redirect\("\/cards\/new"\)/);
    assert.doesNotMatch(page, /MailDayForm/);
    assert.doesNotMatch(page, /loginPath\("\/mail-day"\)/);
  });

  it("does not treat a public card's posts as an owner page", () => {
    assert.equal(routeAccess(`/cards/${CARD}/posts`), "public");
    assert.equal(routeAccess(`/cards/${CARD}`), "account");
    assert.equal(routeAccess(`/cards/${CARD}/edit`), "account");
  });

  it("keeps install files, auth, share links, and OG images public", async () => {
    const paths = [
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable.png",
      "/apple-touch-icon.png",
      "/apple-icon.png",
      "/favicon.ico",
      "/robots.txt",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/opengraph-image",
      "/twitter-image",
      `/posts/${CARD}/opengraph-image`,
      `/posts/${CARD}/twitter-image`,
      "/u/maya/opengraph-image",
      "/u/maya/twitter-image",
      `/u/maya/cards/${CARD}/opengraph-image`,
      `/u/maya/cards/${CARD}/twitter-image`,
      `/cards/${CARD}/opengraph-image`,
      `/cards/${CARD}/twitter-image`,
      "/profile/opengraph-image",
      "/profile/twitter-image",
      "/auth/callback",
      "/auth/confirm",
      "/reset-password",
      "/login",
      "/signup",
      "/forgot-password",
      "/privacy",
      `/posts/${CARD}`,
      "/u/maya",
      `/u/maya/cards/${CARD}`,
    ];
    for (const path of paths) {
      assert.equal(routeAccess(path), "public", path);
      assert.equal(requiresAccount(path), false, path);
    }
    const assets = paths.filter((path) => isStaticPublicPath(path));
    assert.ok(assets.includes("/manifest.webmanifest"));
    assert.ok(assets.includes(`/posts/${CARD}/opengraph-image`));
    assert.ok(assets.includes(`/u/maya/cards/${CARD}/twitter-image`));
    for (const path of assets) {
      assert.equal(
        await pathIsMissing({
          pathname: path,
          supabaseUrl: "https://example.supabase.co",
          anonKey: "anon-key",
          cookies: [],
          fetchImpl: async () => {
            throw new Error(`missing check fetched ${path}`);
          },
        }),
        false,
        path,
      );
    }
  });

  it("does not gate the paths share buttons actually copy", () => {
    const root = process.cwd();
    const share = readFileSync(join(root, "components/share-button.tsx"), "utf8");
    const profile = readFileSync(join(root, "components/profile-view.tsx"), "utf8");
    const tweet = readFileSync(join(root, "components/tweet.tsx"), "utf8");
    const card = readFileSync(join(root, "components/public-card-view.tsx"), "utf8");
    const proxySource = readFileSync(join(root, "proxy.ts"), "utf8");
    assert.match(profile, /path=\{userHref\(profile\.username\)\}/);
    assert.match(tweet, /sharePath=\{`\/posts\/\$\{post\.id\}`\}/);
    assert.doesNotMatch(card, /\/cards\/\$\{/);
    assert.match(share, /new URL\(path,/);
    assert.match(proxySource, /isStaticPublicPath\(request\.nextUrl\.pathname\)/);
    const matcher = proxySource.slice(proxySource.indexOf("matcher:"));
    for (const skipped of [
      "manifest",
      "/icons",
      "apple-touch-icon",
      "apple-icon",
      "favicon",
      "robots",
      "_next",
      "opengraph-image",
      "twitter-image",
    ]) {
      assert.equal(matcher.includes(skipped), false, skipped);
    }
  });
});

describe("signed-out shell", () => {
  it("redirects with requiresAccount and renders the branded 404", () => {
    const root = process.cwd();
    const shell = readFileSync(join(root, "components/app-shell.tsx"), "utf8");
    const notFound = readFileSync(join(root, "app/not-found.tsx"), "utf8");
    assert.match(shell, /requiresAccount\(pathname\)/);
    assert.doesNotMatch(shell, /!isGuestContentPage/);
    assert.match(notFound, /Page not found/);
    assert.match(notFound, /href="\/"/);
    assert.match(notFound, /href="\/signup"/);
    assert.match(notFound, /Home/);
    assert.match(notFound, /Sign up/);
  });
});
