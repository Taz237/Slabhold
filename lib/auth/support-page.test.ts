import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isGuestContentPage, shouldShowJoinBar } from "./guest-paths";
import { requiresAccount, routeAccess } from "./route-access";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("/support", () => {
  it("is public and reads as a guest page", () => {
    assert.equal(routeAccess("/support"), "public");
    assert.equal(requiresAccount("/support"), false);
    assert.equal(isGuestContentPage("/support"), true);
    assert.equal(shouldShowJoinBar(false, "/support"), false);
  });

  it("has contact, report, block, delete and policy links", () => {
    const page = read("app/(app)/support/page.tsx");
    assert.match(page, /title: "Support · Slabhold"/);
    assert.match(page, /href=\{`mailto:\$\{SUPPORT_EMAIL\}`\}/);
    assert.match(page, /Reports are reviewed within 24 hours/);
    assert.match(page, /In a DM, it&apos;s at the top of the thread/);
    assert.match(page, /href="\/settings\/privacy"/);
    assert.match(page, /Type DELETE to confirm/);
    assert.match(page, /href="\/terms"/);
    assert.match(page, /href="\/privacy"/);
    assert.match(page, /<article className="space-y-4 text-15 leading-6">/);
  });

  it("is linked from About and Terms", () => {
    assert.match(read("app/(app)/about/page.tsx"), /href="\/support"/);
    assert.match(read("app/(app)/terms/page.tsx"), /href="\/support"/);
  });
});

describe("13+ and payments copy", () => {
  it("puts the age and payments paragraph second on Terms", () => {
    const terms = read("app/(app)/terms/page.tsx");
    const age = terms.indexOf("You must be 13 or older to use Slabhold.");
    assert.ok(age > terms.indexOf("zero tolerance"));
    assert.ok(age < terms.indexOf("Don&apos;t post spam"));
    assert.match(terms, /Slabhold doesn&apos;t process payments\./);
  });

  it("asks signups to confirm they're 13 or older", () => {
    const form = read("components/auth-form.tsx");
    assert.match(form, /By signing up you confirm you&apos;re 13 or older and agree to the\{" "\}/);
    assert.match(form, /<Link href="\/terms" className="font-semibold underline">/);
    assert.match(form, /<Link href="\/privacy" className="font-semibold underline">/);
  });

  it("points Privacy at Privacy & safety for account deletion", () => {
    const privacy = read("app/(app)/privacy/page.tsx");
    assert.match(privacy, /delete your account from Privacy &amp; safety in the menu/);
    assert.doesNotMatch(privacy, /from More/);
  });
});
