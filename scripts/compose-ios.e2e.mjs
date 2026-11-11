/**
 * The X-style composer at iPhone size (390x844), keyboard down and up.
 * Not part of `npm test`: it needs a running production build and the
 * pre-installed Playwright.
 *
 *   npx next build && npx next start -p 3100 &
 *   node scripts/compose-ios.e2e.mjs http://localhost:3100 [screenshot-dir]
 *
 * Runs on local accounts (no Supabase). Headless Chromium has no on-screen
 * keyboard, so "keyboard up" is the iOS app's own signal: a keyboardWillShow
 * event with keyboardHeight 336, the way Capacitor's Keyboard plugin sends it,
 * plus a grey 336px block drawn where the keys would be. Checks the toolbar
 * sits right on top of it, and on the bottom edge once it closes.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const SHOTS = process.argv[3] || null;
const KEYBOARD = 336;
const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => localStorage.getItem("cardflip.social.v1"));
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("cardflip.social.v1"));
    const me = db.users.find((user) => user.username === "flipcity");
    db.sessionUserId = me.id;
    localStorage.setItem("cardflip.social.v1", JSON.stringify(db));
    localStorage.setItem(`slabhold.setup.${me.id}`, "done");
    localStorage.setItem(`slabhold.tour.seen.${me.id}`, "1");
    localStorage.setItem(`slabhold.install-step.${me.id}`, "later");
    localStorage.setItem(`slabhold.add-to-home.dismissed.${me.id}`, "1");
  });
  await page.close();
}

async function keyboard(page, height) {
  await page.evaluate((h) => {
    document.getElementById("e2e-keys")?.remove();
    const event = new Event(h ? "keyboardWillShow" : "keyboardWillHide");
    if (h) Object.assign(event, { keyboardHeight: h });
    window.dispatchEvent(event);
    if (!h) return;
    const keys = document.createElement("div");
    keys.id = "e2e-keys";
    keys.textContent = "keyboard";
    keys.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${h}px;z-index:9999;background:#3f3f46;color:#a1a1aa;display:grid;place-items:center;font:14px system-ui`;
    document.body.appendChild(keys);
  }, height);
  await page.waitForTimeout(150);
}

async function toolbarBox(page) {
  const box = await page.locator('[data-slot="compose-toolbar"]').boundingBox();
  assert.ok(box, "toolbar drawn");
  return box;
}

async function run(scheme) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_SAFARI_UA,
    colorScheme: scheme,
  });
  try {
    await signIn(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/compose`);
    const field = page.locator('[role="dialog"] textarea');
    await field.waitFor();
    await page.waitForTimeout(400);
    assert.equal(await field.evaluate((el) => el === document.activeElement), true, "autofocused");
    assert.equal(await page.getByRole("button", { name: "Post" }).isDisabled(), true, "Post waits for text");
    await field.fill("Pulled the Wemby Prizm silver at the card show. Sending it to PSA this week.");
    assert.equal(await page.getByRole("button", { name: "Post" }).isDisabled(), false);

    await keyboard(page, KEYBOARD);
    let box = await toolbarBox(page);
    assert.equal(Math.round(box.y + box.height), 844 - KEYBOARD, "toolbar sits on the keyboard");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `compose-keyboard-up-${scheme}.png`) });

    await keyboard(page, 0);
    await field.blur();
    box = await toolbarBox(page);
    assert.equal(Math.round(box.y + box.height), 844, "toolbar on the bottom edge with the keyboard down");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `compose-keyboard-down-${scheme}.png`) });
  } finally {
    await browser.close();
  }
}

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
for (const scheme of ["dark", "light"]) await run(scheme);
console.log("compose-ios e2e: ok");
