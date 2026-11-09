import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TOTAL_BADGES } from "@/lib/badges/config";
import { SIDE_MENU_SETTINGS, SIDE_MENU_SUPPORT } from "@/lib/ui/side-menu";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
/** Page text with JSX line breaks and entities folded, so a sentence matches across lines. */
const flat = (source: string) =>
  source
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\{" "\}/g, " ")
    .replace(/\s+/g, " ");

describe("App Store web fixes: Achievements", () => {
  it("drops the Limited Coming soon row and keeps the badge count", () => {
    const view = read("components/badges/achievements-view.tsx");
    assert.doesNotMatch(view, /Coming soon/i);
    assert.doesNotMatch(view, /LimitedRow/);
    assert.equal(TOTAL_BADGES, 42);
    assert.match(read("lib/badges/config.ts"), /None yet, so Achievements hides Limited\./);
  });
});

describe("App Store web fixes: privacy policy", () => {
  const source = read("app/(app)/privacy/page.tsx");
  const text = flat(source);

  it("covers Apple and Google sign-in, push, the iPhone app and age", () => {
    for (const word of ["Apple", "Google", "Hide My Email", "push", "13 and older", "Last updated", "The iPhone app"]) {
      assert.ok(text.includes(word), `missing ${word}`);
    }
    assert.match(source, /<h2[^>]*>Notifications<\/h2>/);
    assert.match(source, /<h2[^>]*>Cookies and this device<\/h2>/);
    assert.doesNotMatch(source, /Cookies and this browser/);
  });

  it("drops the local dev mode sentence", () => {
    assert.ok(!text.includes("If Supabase is not connected"));
  });

  it("keeps the pinned sentences", () => {
    for (const sentence of [
      "delete your account from Privacy &amp; safety in the menu",
      "We use Cloudflare Turnstile on sign-up, log-in and password reset forms to block bots.",
      "We use Vercel Web Analytics and Speed Insights to count page views and measure performance",
      "but your name and any preview of what you wrote are removed.",
      "We keep that hash for up to two days.",
    ]) {
      assert.ok(text.includes(sentence), `missing: ${sentence}`);
    }
    assert.ok(!text.includes("from More"));
    assert.ok(!text.includes("without your name"));
  });

  it("uses no bold weight", () => {
    assert.doesNotMatch(source, /font-bold/);
  });
});

describe("App Store web fixes: Help & support", () => {
  it("adds a support link without changing the settings links", () => {
    assert.deepEqual(SIDE_MENU_SUPPORT, { href: "/support", label: "Help & support" });
    assert.deepEqual(
      SIDE_MENU_SETTINGS.map((item) => item.href),
      ["/settings/notifications", "/settings/privacy", "/settings/invite", "/settings/collecting", "/about", "/privacy", "/terms"],
    );
  });

  it("renders Help & support after the settings rows and before the admin links", () => {
    const menu = read("components/side-menu.tsx");
    const settings = menu.indexOf("SIDE_MENU_SETTINGS.map(");
    const support = menu.indexOf("href={SIDE_MENU_SUPPORT.href}");
    const admin = menu.indexOf("<AdminMenuLinks");
    assert.ok(settings > 0 && support > settings && admin > support);
    assert.match(menu, /<LifeBuoy aria-hidden/);
    assert.match(menu, /\{SIDE_MENU_SUPPORT\.label\}/);
  });

  it("links Support from the landing footer", () => {
    const landing = read("components/landing-page.tsx");
    const footer = landing.slice(landing.indexOf("<footer"), landing.indexOf("</footer>"));
    assert.match(footer, /href="\/support" prefetch=\{false\}/);
    assert.match(footer, />\s*Support\s*</);
  });
});
