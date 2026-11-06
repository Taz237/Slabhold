import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialSignIn } from "./auth-social";

const buttonClass = (provider: "apple" | "google") =>
  renderToStaticMarkup(createElement(SocialSignIn, { providers: [provider], next: "/collection", failed: false })).match(
    /<button[^>]*class="([^"]*)"/,
  )![1];

describe("Sign in with Apple, white style", () => {
  it("is white with black text and logo, so it shows on dark backgrounds", () => {
    const apple = buttonClass("apple");
    assert.match(apple, /\bbg-white\b/);
    assert.match(apple, /\btext-black\b/);
    assert.doesNotMatch(apple, /\bbg-black\b|\btext-white\b/);
    assert.doesNotMatch(apple, /ring-white/);
  });

  it("leaves Google exactly as it was", () => {
    const google = buttonClass("google");
    assert.match(google, /border border-\[#747775\] bg-white text-\[#1F1F1F\]/);
  });
});
