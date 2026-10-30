import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LANDING_PATH, servesLanding } from "@/lib/auth/landing-route";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("signed-out Home route", () => {
  it("serves the landing route at / only when no session cookie is sent", () => {
    const base = { pathname: "/", supabaseConfigured: true };
    assert.equal(servesLanding({ ...base, cookieHeader: "" }), true);
    assert.equal(servesLanding({ ...base, cookieHeader: "theme=dark; slabhold_email_hint=a" }), true);
    assert.equal(servesLanding({ ...base, cookieHeader: "sb-abc-auth-token=x" }), false);
    assert.equal(servesLanding({ ...base, cookieHeader: "a=1; sb-abc-auth-token.0=x" }), false);
  });

  it("leaves every other page, and local accounts, alone", () => {
    assert.equal(servesLanding({ pathname: "/login", cookieHeader: "", supabaseConfigured: true }), false);
    assert.equal(servesLanding({ pathname: "/", cookieHeader: "", supabaseConfigured: false }), false);
  });

  it("is wired into proxy.ts as a rewrite of /, before anything else", () => {
    const proxy = read("proxy.ts");
    assert.match(proxy, /servesLanding\(/);
    assert.match(proxy, /NextResponse\.rewrite\(new URL\(LANDING_PATH, request\.url\)\)/);
    assert.match(proxy, /matcher: \[\s*"\/",/);
    assert.equal(LANDING_PATH, "/welcome");
  });

  it("keeps the landing route out of the app's layout and its providers", () => {
    const page = read("app/welcome/page.tsx");
    assert.match(page, /<LandingPage founder=\{founder\} \/>/);
    assert.match(page, /canonical: "\/"/);
    assert.match(page, /export const revalidate = 1800;/);
    const root = read("app/layout.tsx");
    for (const provider of ["SocialProvider", "CollectionProvider", "AppShell", "ImageLightboxProvider"]) {
      assert.doesNotMatch(root, new RegExp(provider), provider);
    }
    assert.match(read("app/(app)/layout.tsx"), /<AppChrome>\{children\}<\/AppChrome>/);
  });
});
