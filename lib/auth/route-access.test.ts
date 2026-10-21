import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { requiresAccount, routeAccess } from "./route-access";

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
      "/mail-day",
      "/messages",
      "/messages/maya",
      "/notifications",
      "/more",
      "/profile",
      "/profile/followers",
      "/profile/following",
      "/settings",
      "/settings/privacy",
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

  it("does not treat a public card's posts as an owner page", () => {
    assert.equal(routeAccess(`/cards/${CARD}/posts`), "public");
    assert.equal(routeAccess(`/cards/${CARD}`), "account");
    assert.equal(routeAccess(`/cards/${CARD}/edit`), "account");
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
