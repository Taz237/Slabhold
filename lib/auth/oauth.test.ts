import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  APP_RETURN_PATH,
  appSchemeReturn,
  needsHandle,
  oauthLandingPath,
  oauthProviders,
  oauthRedirectTo,
  oauthReturnPath,
} from "./oauth";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("oauthProviders", () => {
  it("is off by default", () => {
    assert.deepEqual(oauthProviders({}), []);
    assert.deepEqual(oauthProviders({ apple: "0", google: "true" }), []);
  });

  it("turns each one on by its own flag, Apple first", () => {
    assert.deepEqual(oauthProviders({ apple: "1" }), ["apple"]);
    assert.deepEqual(oauthProviders({ google: "1" }), ["google"]);
    assert.deepEqual(oauthProviders({ google: "1", apple: "1" }), ["apple", "google"]);
  });

  it("reads the two NEXT_PUBLIC flags by name, so Next inlines them", () => {
    const source = read("lib/auth/oauth.ts");
    assert.match(source, /process\.env\.NEXT_PUBLIC_AUTH_APPLE/);
    assert.match(source, /process\.env\.NEXT_PUBLIC_AUTH_GOOGLE/);
  });
});

describe("oauthRedirectTo", () => {
  it("returns to /auth/oauth on the web, keeping next", () => {
    assert.equal(
      oauthRedirectTo("https://slabhold.app", "/u/maya?tab=cards", false),
      "https://slabhold.app/auth/oauth?next=%2Fu%2Fmaya%3Ftab%3Dcards",
    );
  });

  it("returns to the universal link in the app", () => {
    assert.equal(
      oauthRedirectTo("https://slabhold.app", "/collection", true),
      "https://slabhold.app/auth/app-return?next=%2Fcollection",
    );
  });

  it("drops unsafe and auth-screen next values", () => {
    assert.equal(oauthRedirectTo("https://slabhold.app", "https://evil.example", false), "https://slabhold.app/auth/oauth?next=%2F");
    assert.equal(oauthRedirectTo("https://slabhold.app", "//evil.example", false), "https://slabhold.app/auth/oauth?next=%2F");
    assert.equal(oauthRedirectTo("https://slabhold.app", "/login?next=/x", false), "https://slabhold.app/auth/oauth?next=%2F");
    assert.equal(oauthRedirectTo("https://slabhold.app", null, true), "https://slabhold.app/auth/app-return?next=%2F");
  });
});

describe("oauthReturnPath", () => {
  it("turns the app return into the WebView exchange, query and all", () => {
    assert.equal(oauthReturnPath("/auth/app-return?code=abc&next=%2Fcollection"), "/auth/oauth?code=abc&next=%2Fcollection");
    assert.equal(oauthReturnPath("/auth/app-return"), "/auth/oauth");
    assert.equal(oauthReturnPath("/auth/app-return/?error=access_denied#x"), "/auth/oauth?error=access_denied");
  });

  it("leaves every other link alone", () => {
    assert.equal(oauthReturnPath(null), null);
    assert.equal(oauthReturnPath("/u/maya"), null);
    assert.equal(oauthReturnPath("/auth/callback?code=abc"), null);
    assert.equal(oauthReturnPath("/auth/app-returned"), null);
  });

  it("hands a browser-opened return to the app's scheme", () => {
    assert.equal(appSchemeReturn("?code=abc&next=%2F"), "slabhold://auth/app-return?code=abc&next=%2F");
    assert.equal(appSchemeReturn(""), "slabhold://auth/app-return");
  });
});

describe("needsHandle", () => {
  it("asks a new Apple or Google account to pick a handle", () => {
    assert.equal(needsHandle({ app_metadata: { provider: "apple" }, user_metadata: {} }), true);
    assert.equal(needsHandle({ app_metadata: { provider: "google" }, user_metadata: { full_name: "Maya" } as never }), true);
    assert.equal(needsHandle({ app_metadata: { provider: "google" }, user_metadata: { username: " " } }), true);
  });

  it("skips email accounts and anyone who already picked", () => {
    assert.equal(needsHandle({ app_metadata: { provider: "email" }, user_metadata: {} }), false);
    assert.equal(needsHandle({ app_metadata: { provider: "apple" }, user_metadata: { username: "waxroom" } }), false);
    assert.equal(needsHandle(null), false);
  });
});

describe("oauthLandingPath", () => {
  it("goes on to next, like email login", () => {
    assert.equal(oauthLandingPath({ next: "/cards/abc", ok: true, needsHandle: false }), "/cards/abc");
    assert.equal(oauthLandingPath({ next: "https://evil.example", ok: true, needsHandle: false }), "/");
  });

  it("sends a new account to pick a handle first, keeping next", () => {
    assert.equal(
      oauthLandingPath({ next: "/cards/abc", ok: true, needsHandle: true }),
      "/settings/handle?next=%2Fcards%2Fabc",
    );
  });

  it("returns a failed sign-in to login with the same next", () => {
    assert.equal(
      oauthLandingPath({ next: "/cards/abc", ok: false, needsHandle: false }),
      "/login?next=%2Fcards%2Fabc&oauth=failed",
    );
  });
});

type AasaComponent = { "/": string; exclude?: boolean };

/** Apple checks components in order and the first match wins. */
function firstMatch(components: AasaComponent[], path: string): AasaComponent | undefined {
  return components.find((component) => {
    const pattern = new RegExp(
      `^${component["/"].replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    );
    return pattern.test(path);
  });
}

describe("apple-app-site-association", () => {
  const aasa = JSON.parse(read("public/.well-known/apple-app-site-association")) as {
    applinks: { details: { components: AasaComponent[] }[] };
  };
  const components = aasa.applinks.details[0].components;

  it("lists the app return before the /auth/* exclude", () => {
    const include = components.findIndex((c) => c["/"] === APP_RETURN_PATH && !c.exclude);
    const exclude = components.findIndex((c) => c["/"] === "/auth/*" && c.exclude);
    assert.ok(include >= 0, "app return is listed");
    assert.ok(exclude >= 0, "/auth/* exclude is still there");
    assert.ok(include < exclude, "include comes first");
  });

  it("opens the app on the return, and keeps the other auth links on the web", () => {
    assert.equal(firstMatch(components, "/auth/app-return")?.exclude, undefined);
    assert.equal(firstMatch(components, "/auth/oauth")?.exclude, true);
    assert.equal(firstMatch(components, "/auth/confirm")?.exclude, true);
    assert.equal(firstMatch(components, "/auth/callback")?.exclude, true);
  });
});

describe("Continue with Apple / Google wiring", () => {
  it("has the two return routes", () => {
    assert.match(read("app/auth/oauth/route.ts"), /exchangeCodeForSession/);
    assert.match(read("app/auth/app-return/route.ts"), /appSchemeReturn/);
  });

  it("closes the in-app browser and finishes sign-in in the WebView", () => {
    const native = read("lib/ios/native.ts");
    assert.match(native, /oauthReturnPath\(/);
    assert.match(native, /Browser\.close\(\)/);
    assert.match(native, /export function openAuthBrowser/);
  });

  it("shows the buttons on login and signup, above the email form", () => {
    const form = read("components/auth-form.tsx");
    const uses = form.match(/<SocialSignIn /g) ?? [];
    assert.equal(uses.length, 2);
  });

  it("ships none of the buttons' code unless a flag is on", () => {
    const form = read("components/auth-form.tsx");
    assert.match(
      form,
      /const SOCIAL_ON = process\.env\.NEXT_PUBLIC_AUTH_APPLE === "1" \|\| process\.env\.NEXT_PUBLIC_AUTH_GOOGLE === "1";/,
    );
    assert.match(form, /const SocialSignIn = SOCIAL_ON\s*\? dynamic\(/);
    assert.doesNotMatch(form, /^import [^;]*auth-social/m);
  });

  it("keeps setup off the handle screen", () => {
    assert.match(read("lib/onboarding/first-run.ts"), /HANDLE_PATH/);
  });
});
