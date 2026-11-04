import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { outlineButton } from "@/components/button-styles";
import { NotFoundView } from "@/components/not-found-view";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";

function render(social: Partial<SocialContextValue>) {
  return renderToStaticMarkup(
    createElement(SocialContext.Provider, { value: social as SocialContextValue }, createElement(NotFoundView)),
  );
}

const collector = { id: "u-fixture", username: "collector", displayName: "Fixture Collector" };

describe("404 actions", () => {
  it("offers Sign up to signed-out visitors", () => {
    const html = render({ ready: true, user: null });
    assert.match(html, /Page not found/);
    assert.match(html, /href="\/"[^>]*>Home</);
    assert.match(html, /href="\/signup"[^>]*>Sign up</);
    assert.doesNotMatch(html, /Search collectors/);
  });

  it("stays signed-out until auth is known", () => {
    const html = render({ ready: false, user: collector as SocialContextValue["user"] });
    assert.match(html, /href="\/signup"[^>]*>Sign up</);
    assert.doesNotMatch(html, /\/search/);
  });

  it("offers Search collectors, never Sign up, once signed in", () => {
    const html = render({ ready: true, user: collector as SocialContextValue["user"] });
    assert.match(html, /Page not found/);
    assert.match(html, /href="\/"[^>]*>Home</);
    assert.match(html, /href="\/search"[^>]*>Search collectors</);
    assert.doesNotMatch(html, /Sign up/);
    assert.doesNotMatch(html, /\/signup/);
  });

  it("keeps both buttons at least 44px tall", () => {
    for (const html of [render({ ready: true, user: null }), render({ ready: true, user: collector as SocialContextValue["user"] })]) {
      const second = html.match(/<a[^>]*href="\/(?:signup|search)"[^>]*>/);
      assert.ok(second, "second button");
      assert.match(second[0], /min-h-11/);
      assert.ok(second[0].includes(outlineButton), "same look as outlineButton");
    }
  });

  it("is a small client child of the server view", () => {
    const actions = readFileSync(join(process.cwd(), "components/not-found-actions.tsx"), "utf8");
    assert.match(actions, /^"use client";/);
    assert.match(actions, /useSocial\(\)/);
    const view = readFileSync(join(process.cwd(), "components/not-found-view.tsx"), "utf8");
    assert.doesNotMatch(view, /"use client"/);
    assert.match(view, /<NotFoundActions\b/);
    assert.match(view, /href="\/search"/);
  });
});
