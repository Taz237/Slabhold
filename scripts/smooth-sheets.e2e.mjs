/**
 * Bottom sheets at iPhone size (390x844): the Send in a DM sheet slides up, follows
 * a downward swipe, closes past the threshold, springs back from a short
 * drag, and slides away when the backdrop is tapped.
 * Not part of `npm test`: it needs a running build and the pre-installed Playwright.
 *
 *   npx next build && npx next start -p 3100 &
 *   node scripts/smooth-sheets.e2e.mjs http://localhost:3100 [screenshot-dir]
 *
 * Runs on local accounts (no Supabase).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const SHOTS = process.argv[3] || null;
const SHEET = "[data-send-post-sheet]";
const OPEN = 'article[data-nav-href] button[aria-label="Send in a DM"]';

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

async function run(scheme) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    hasTouch: true,
    isMobile: true,
  });
  await signIn(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}-390-${scheme}.png`) });
  };
  const touch = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  /** A finger drag straight down from the sheet's grabber, in 12 steps. */
  async function dragDown(distance, { hold = false } = {}) {
    const box = await page.locator(SHEET).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + 10;
    await touch("touchStart", x, y);
    for (let step = 1; step <= 12; step += 1) {
      await touch("touchMove", x, y + (distance * step) / 12);
      await page.waitForTimeout(16);
    }
    if (hold) return () => touch("touchEnd", x, y + distance);
    await touch("touchEnd", x, y + distance);
    return null;
  }
  const openSheet = async () => {
    await page.locator(OPEN).first().click();
    await page.waitForSelector(SHEET);
    await page.waitForTimeout(650);
  };
  const sheetBottomGap = () =>
    page.evaluate((sel) => Math.round(window.innerHeight - document.querySelector(sel).getBoundingClientRect().bottom), SHEET);

  await page.goto(`${BASE}/`);
  await page.waitForSelector("article[data-nav-href]");

  // 1. Slides up from the bottom edge and rests flush on it.
  await page.locator(OPEN).first().click();
  await page.waitForSelector(SHEET);
  const opening = await page.evaluate((sel) => {
    const style = getComputedStyle(document.querySelector(sel));
    return { name: style.animationName, properties: document.querySelector(sel).getAnimations().length };
  }, SHEET);
  assert.equal(opening.name, "sheet-slide", "the sheet opens with the slide");
  await page.waitForTimeout(650);
  assert.equal(await sheetBottomGap(), 0, "the sheet rests on the bottom edge");
  await shot("send-sheet-open");

  // 2. A short drag follows the finger, then springs back.
  const release = await dragDown(60, { hold: true });
  await page.waitForTimeout(60);
  assert.ok((await sheetBottomGap()) <= -50, `the sheet follows the finger (${await sheetBottomGap()})`);
  await shot("send-sheet-mid-swipe");
  await release();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(SHEET).count(), 1, "a short drag keeps it open");
  assert.equal(await sheetBottomGap(), 0, "and it settles back");

  // 3. A long drag down closes it.
  await dragDown(260);
  await page.waitForSelector(SHEET, { state: "detached", timeout: 2000 });

  // 4. Tapping the backdrop slides it away: still there right after the tap, gone a moment later.
  await openSheet();
  await page.touchscreen.tap(195, 60);
  await page.waitForTimeout(60);
  assert.equal(await page.locator(SHEET).count(), 1, "the sheet slides away instead of vanishing");
  await page.waitForSelector(SHEET, { state: "detached", timeout: 2000 });
  assert.equal(new URL(page.url()).pathname, "/", "the tap closed the sheet and did not open the post behind it");

  // 5. Reduce Motion: no slide in, and it closes at once.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
  await page.locator(OPEN).first().click();
  await page.waitForSelector(SHEET);
  assert.equal(
    await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).animationName, SHEET),
    "none",
    "no slide with Reduce Motion",
  );
  await page.touchscreen.tap(195, 60);
  await page.waitForSelector(SHEET, { state: "detached", timeout: 300 });

  await browser.close();
  console.log(`ok ${scheme}`);
}

for (const scheme of ["dark", "light"]) await run(scheme);
