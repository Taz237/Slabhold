import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppleFinishStep } from "@/components/delete-account";
import { APPLE_FINISH_COPY, APPLE_FINISH_STEPS, usedAppleSignIn } from "./apple-sign-in";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("usedAppleSignIn", () => {
  it("is true for an Apple login, however Supabase lists it", () => {
    assert.equal(usedAppleSignIn({ app_metadata: { provider: "apple" } }), true);
    assert.equal(usedAppleSignIn({ app_metadata: { provider: "email", providers: ["email", "apple"] } }), true);
    assert.equal(usedAppleSignIn({ identities: [{ provider: "google" }, { provider: "apple" }] }), true);
  });

  it("is false for email, Google and anything odd", () => {
    assert.equal(usedAppleSignIn({ app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email" }] }), false);
    assert.equal(usedAppleSignIn({ app_metadata: { provider: "google", providers: ["google"] } }), false);
    for (const odd of [null, undefined, "apple", {}, { identities: "apple" }, { identities: [null, 3] }, { app_metadata: "apple" }]) {
      assert.equal(usedAppleSignIn(odd), false);
    }
  });
});

describe("delete account: finishing with Apple", () => {
  it("names the path in Settings, in order", () => {
    assert.deepEqual([...APPLE_FINISH_STEPS], ["Settings", "your name", "Sign-In & Security", "Sign in with Apple", "Slabhold", "Stop Using"]);
  });

  it("shows the steps as an ordered list with a Done button", () => {
    const html = renderToStaticMarkup(createElement(AppleFinishStep, { onDone() {} }));
    assert.ok(html.includes(APPLE_FINISH_COPY.title));
    assert.match(html, /<ol[^>]*aria-label="Steps on your iPhone"/);
    const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    assert.deepEqual(items, ["1Settings", "2your name", "3Sign-In &amp; Security", "4Sign in with Apple", "5Slabhold", "6Stop Using"]);
    assert.match(html, /<button[^>]*>Done<\/button>/);
    assert.doesNotMatch(html, /text-\[(8|9|10)px\]|teal/);
  });

  it("the route says when the deleted login was Apple, read before the delete", () => {
    const route = read("app/api/account/delete/route.ts");
    assert.match(route, /usedAppleSignIn\(/);
    assert.ok(route.indexOf("getUserById(") < route.indexOf("runAccountDelete("), "looked up before the user is gone");
    assert.match(route, /result\.status === 200 && apple/);
  });

  it("the screen shows the step before it signs out and leaves, and only for Apple", () => {
    const screen = read("components/delete-account.tsx");
    assert.match(screen, /if \(payload\.apple === true\) \{\s*setAppleStep\(true\);/);
    const finish = screen.slice(screen.indexOf("async function finish()"));
    assert.ok(finish.indexOf("signOut()") < finish.indexOf('router.replace("/?notice=account-deleted")'));
  });
});
