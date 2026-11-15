/**
 * Page changes at iPhone size (390x844): the skeleton a tap shows at once,
 * back arrows that go back in history, and scroll that stays where you left it.
 * Not part of `npm test`: it needs a running build and the pre-installed Playwright.
 *
 *   npx next build && npx next start -p 3100 &
 *   node scripts/smooth-nav.e2e.mjs http://localhost:3100 [screenshot-dir]
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

const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));
const pendingKind = (page) => page.evaluate(() => document.documentElement.dataset.navPending ?? null);

/** Clicks, and reads the tap-time skeleton in the same task, before the router can answer. */
async function tapAndReadPending(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    node.click();
    return document.documentElement.dataset.navPending ?? null;
  }, selector);
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
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}-390-${scheme}.png`) });
  };

  await page.goto(`${BASE}/`);
  await page.waitForSelector("article[data-nav-href]");
  // The post and profile skeletons arrive after the first idle moment.
  await page.waitForSelector('[data-pending-kind="post"]', { state: "attached" });
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(200);
  const left = await scrollY(page);
  assert.ok(left > 300, `Home scrolled (${left})`);

  // 1. A post row shows the post skeleton in the same task as the tap.
  const row = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("article[data-nav-href]")];
    const hit = rows.find((item) => item.getBoundingClientRect().top > 80) ?? rows[0];
    // The row itself: a tap that missed its links and buttons.
    hit.setAttribute("data-e2e-row-text", "");
    return hit.dataset.navHref;
  });
  // Hold the page request, so the skeleton stays up for the screenshot.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(`**${row}*`, async (route) => {
    await held;
    await route.continue();
  });
  assert.equal(await tapAndReadPending(page, "[data-e2e-row-text]"), "post", "post skeleton on tap");
  await page.waitForTimeout(450);
  await shot("post-skeleton-on-tap");
  release();
  await page.waitForURL(`**${row}`);
  await page.unroute(`**${row}*`);
  await page.waitForSelector('button[aria-label="Back"]');
  assert.equal(await pendingKind(page), null, "skeleton cleared when the post drew");
  assert.equal(await scrollY(page), 0, "the post opens at the top");
  await page.waitForTimeout(500);
  await shot("post-page");

  // 2. The back arrow goes back in history: Home is where you left it.
  await page.click('button[aria-label="Back"]');
  await page.waitForURL(`${BASE}/`);
  await page.waitForTimeout(700);
  assert.ok(Math.abs((await scrollY(page)) - left) <= 2, `Home kept its scroll (${await scrollY(page)} vs ${left})`);

  // 3. Someone else's profile: skeleton on tap, a back arrow, and Home again in place.
  const profile = await page.evaluate(() => {
    const own = "/u/flipcity";
    const links = [...document.querySelectorAll("article a[href^='/u/']")].filter((link) => {
      const top = link.getBoundingClientRect().top;
      return link.getAttribute("href") !== own && !link.getAttribute("href").includes("/cards/") && top > 80 && top < 700;
    });
    links[0].setAttribute("data-e2e-profile", "");
    return links[0].getAttribute("href");
  });
  assert.equal(await tapAndReadPending(page, "[data-e2e-profile]"), "profile", "profile skeleton on tap");
  await page.waitForURL(`**${profile}`);
  await page.waitForSelector('button[aria-label="Back"]');
  await page.waitForTimeout(600);
  await shot("profile-back-arrow");
  await page.click('button[aria-label="Back"]');
  await page.waitForURL(`${BASE}/`);
  await page.waitForTimeout(700);
  assert.ok(Math.abs((await scrollY(page)) - left) <= 2, "Home kept its scroll after a profile");

  // 4. Tabs keep their spot. A second tap on Home goes to the top.
  await page.click('nav a[href="/collection"]');
  await page.waitForURL("**/collection");
  await page.waitForTimeout(400);
  await page.click('nav a[href="/"]');
  await page.waitForURL(`${BASE}/`);
  await page.waitForTimeout(900);
  assert.ok(Math.abs((await scrollY(page)) - left) <= 2, `the Home tab came back in place (${await scrollY(page)})`);
  await page.click('nav a[href="/"]');
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 4000 });

  // 5. The logo does the same on Home.
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(200);
  await page.click('a[aria-label="Slabhold home"]');
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 4000 });
  assert.equal(new URL(page.url()).pathname, "/");

  // 6. A post opened cold: the arrow has nowhere to go back to, so it opens Home.
  const cold = await context.newPage();
  await cold.goto(`${BASE}${row}`);
  await cold.waitForSelector('button[aria-label="Back"]');
  await cold.click('button[aria-label="Back"]');
  await cold.waitForURL(`${BASE}/`);
  await cold.close();

  await browser.close();
  console.log(`ok ${scheme}`);
}

for (const scheme of ["dark", "light"]) await run(scheme);
