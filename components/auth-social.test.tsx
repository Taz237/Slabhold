import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialSignIn } from "./auth-social";
import { setupVisible } from "@/lib/onboarding/first-run";

const render = (providers: ("apple" | "google")[], failed = false) =>
  renderToStaticMarkup(createElement(SocialSignIn, { providers, next: "/collection", failed }));

describe("SocialSignIn", () => {
  it("renders nothing with both flags off", () => {
    assert.equal(render([]), "");
  });

  it("shows only the providers that are on", () => {
    const apple = render(["apple"]);
    assert.match(apple, /Continue with Apple/);
    assert.doesNotMatch(apple, /Continue with Google/);
    const google = render(["google"]);
    assert.match(google, /Continue with Google/);
    assert.doesNotMatch(google, /Continue with Apple/);
  });

  it("puts Apple first, the same size as Google, then the or divider", () => {
    const html = render(["apple", "google"]);
    const apple = html.indexOf("Continue with Apple");
    const google = html.indexOf("Continue with Google");
    assert.ok(apple > 0 && apple < google);
    assert.ok(html.indexOf('aria-label="or"') > google);
    const sizes = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1].match(/\bh-14\b/)?.[0]);
    assert.deepEqual(sizes, ["h-14", "h-14"]);
  });

  it("keeps brand rules: no bold, no teal", () => {
    const html = render(["apple", "google"]);
    assert.doesNotMatch(html, /font-bold|teal/);
  });

  it("shows the failed note when sign-in came back with an error", () => {
    assert.doesNotMatch(render(["apple"]), /didn&#x27;t finish/);
    assert.match(render(["apple"], true), /role="alert"/);
  });
});

describe("first-run setup and the handle screen", () => {
  it("waits on /settings/handle and shows after it", () => {
    const base = {
      signedIn: true,
      stored: null,
      table: "ready" as const,
      answered: false,
      localNewUser: false,
    };
    assert.equal(setupVisible({ ...base, pathname: "/settings/handle" }), false);
    assert.equal(setupVisible({ ...base, pathname: "/" }), true);
  });
});
