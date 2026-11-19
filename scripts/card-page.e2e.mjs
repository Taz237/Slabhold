/**
 * The card page at iPhone size (390x844), on made-up cards and made-up sales
 * (scripts/profile-spotlight.fixtures.mjs), never a real user's data and never
 * a real sold-price call: /api/comps/sold and /api/card-values are answered here.
 * Not part of `npm test`: it needs a running build and the pre-installed Playwright.
 *
 *   npx next build && npx next start -p 3100 &
 *   node scripts/card-page.e2e.mjs http://localhost:3100 docs/card-page-redesign after
 *
 * It takes the screenshots (dark and light) and a video of a finger dragging
 * across the chart, and checks the page: no sideways scroll, one dot per sale,
 * straight line segments, the ⓘ credit, "Last sold" once, the full-screen
 * card, and that nothing moves as the page loads. Pass `before` as the last
 * argument to only take screenshots (for a build from before the redesign).
 * Chromium only: the touch points go in over its debugging protocol.
 */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fixtureCards } from "./profile-spotlight.fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || null;
const TAG = process.argv[4] || "after";
const CHECK = TAG !== "before";
const ME = "flipcity";
const OTHER = "waxroom";
if (OUT) mkdirSync(OUT, { recursive: true });

const DAY = 86_400_000;
const day = (ago) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);

/** Made-up sales: [days ago, price, grade]. */
const SALES = {
  vertical: [
    [1, 212.5, "PSA 10"], [3, 205, "PSA 10"], [3, 219, "PSA 10"], [6, 198, "PSA 10"], [9, 201.5, "PSA 10"],
    [13, 188, "PSA 10"], [17, 192, "PSA 10"], [22, 176, "PSA 10"], [27, 181, "PSA 10"], [33, 169.99, "PSA 10"],
    [38, 172, "PSA 10"], [41, 410, "PSA 10"],
  ],
  horizontal: [[2, 48, ""], [5, 44.5, ""], [9, 51, ""], [14, 46, ""], [19, 42, ""], [24, 45, ""]],
  none: [],
  one: [[4, 24.5, ""]],
  three: [[2, 36, "PSA 9"], [8, 31.5, "PSA 9"], [15, 34, "PSA 9"]],
};

function median(prices) {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
}

function soldPayload(cardId, rows) {
  const prices = rows.map((row) => row[1]);
  return {
    comps: rows.map(([ago, price, grade], index) => ({
      id: `${cardId}-sale-${index}`,
      itemId: `${cardId}-item-${index}`,
      title: `Made-up listing ${index + 1} for the card page run`,
      soldPrice: price,
      soldDate: day(ago),
      platform: "eBay",
      condition: grade || "—",
      shipping: null,
      url: `https://example.test/sale/${index}`,
    })),
    history: [],
    median: prices.length ? median(prices) : null,
    p25: prices.length ? Math.min(...prices) : null,
    p75: prices.length ? Math.max(...prices) : null,
    count: rows.length,
    source: "trawl",
    cached: true,
    fetchedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    query: "",
    lowConfidence: rows.length > 0 && rows.length < 5,
    sample: false,
  };
}

function storedValue(rows) {
  if (!rows.length) return { status: "no_sales", median: null, low: null, high: null, nSales: 0, matchedAt: null };
  const prices = rows.map((row) => row[1]);
  return { status: "ok", median: median(prices), low: Math.min(...prices), high: Math.max(...prices), nSales: rows.length, matchedAt: null };
}

async function open(browser, { scheme = "dark", who = OTHER, video = false, reduced = false, signedOut = false, soldStatus = 200 } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
    hasTouch: true,
    isMobile: true,
    ...(video && OUT ? { recordVideo: { dir: OUT, size: { width: 390, height: 844 } } } : {}),
  });
  const cards = fixtureCards(8);
  // Card 0 is upright and graded, card 1 lies sideways, the rest fill the cases.
  const cases = { vertical: cards[0], horizontal: cards[1], none: cards[3], one: cards[4], three: cards[6] };
  const byId = Object.fromEntries(Object.entries(cases).map(([name, card]) => [card.id, SALES[name]]));
  const values = Object.fromEntries(Object.entries(byId).map(([id, rows]) => [id, storedValue(rows)]));
  await context.route("**/api/card-values*", (route) => route.fulfill({ json: { values } }));
  await context.route("**/api/comps/sold*", (route) => {
    if (soldStatus !== 200) return route.fulfill({ status: soldStatus, json: {} });
    const id = new URL(route.request().url()).searchParams.get("id");
    return route.fulfill({ json: soldPayload(id, byId[id] ?? []) });
  });
  await context.route("**/_vercel/**", (route) => route.fulfill({ status: 204, body: "" }));
  const seed = await context.newPage();
  await seed.goto(`${BASE}/`);
  await seed.waitForFunction(() => localStorage.getItem("cardflip.social.v1"));
  await seed.evaluate(
    ({ cards, who, me, signedOut }) => {
      const db = JSON.parse(localStorage.getItem("cardflip.social.v1"));
      const viewer = db.users.find((user) => user.username === me);
      const owner = db.users.find((user) => user.username === who);
      db.sessionUserId = signedOut ? null : viewer.id;
      db.collections[owner.id] = cards;
      localStorage.setItem("cardflip.social.v1", JSON.stringify(db));
      const now = new Date().toISOString();
      const book = who === me ? cards.map((card) => ({ ...card, isPublic: true, purchasePrice: null, updatedAt: now })) : [];
      localStorage.setItem("cardflip.cards.v1", JSON.stringify(book));
      localStorage.setItem(`slabhold.setup.${viewer.id}`, "done");
      localStorage.setItem(`slabhold.tour.seen.${viewer.id}`, "1");
      localStorage.setItem(`slabhold.install-step.${viewer.id}`, "later");
      localStorage.setItem(`slabhold.add-to-home.dismissed.${viewer.id}`, "1");
    },
    { cards, who, me: ME, signedOut },
  );
  await seed.close();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, cases, errors };
}

/** Open a card and wait for its sales to settle. */
async function show(page, path) {
  await page.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Not supported: the shift check is skipped.
    }
  });
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector("h1");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

/** Two phone screens per case: the top of the page (the card), then the value and its sales. */
async function shot(page, name, scheme) {
  if (!OUT) return;
  const file = (part) => join(OUT, `${TAG}-${name}${part}-390-${scheme}.jpg`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: file(""), type: "jpeg", quality: 82 });
  await page.evaluate(() => {
    const value = document.querySelector("[data-comp-card], [data-comp-empty], [data-value-read], [data-comp-skeleton]");
    if (value) window.scrollTo(0, window.scrollY + value.getBoundingClientRect().top - 76);
  });
  // The line draws in once it is on screen.
  await page.waitForTimeout(1100);
  await page.screenshot({ path: file("-sales"), type: "jpeg", quality: 82 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function touchDrag(page, from, to, { steps = 40, hold = 30 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y) }] });
  await touch("touchStart", from.x, from.y);
  for (let step = 1; step <= steps; step += 1) {
    await touch("touchMove", from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    await page.waitForTimeout(hold);
  }
  await touch("touchEnd");
}

async function checkPage(page, name, saleCount) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.equal(width, 390, `${name}: the page is exactly 390 wide`);
  const cls = await page.evaluate(() => window.__cls ?? 0);
  assert.ok(cls < 0.02, `${name}: nothing moves while it loads (CLS ${cls.toFixed(4)})`);
  const dots = await page.locator("[data-sale-dot]").count();
  assert.equal(dots, saleCount, `${name}: one dot per real sale`);
  const line = await page.locator("[data-sale-line]").getAttribute("d").catch(() => null);
  if (saleCount > 1) assert.ok(line && !/[CSQTA]/i.test(line), `${name}: the line is straight segments only`);
  const text = await page.locator("[data-card-page]").innerText();
  assert.ok((text.match(/last sold/gi) ?? []).length <= 1, `${name}: "Last sold" shows at most once`);
  for (const word of [/\bbest\b/i, /\bAI\b/, /\bfree\b/i, /number one/i, /flip/i]) {
    assert.ok(!word.test(text), `${name}: no banned copy (${word})`);
  }
  // The card is the hero: big, and above everything else on the page.
  const hero = await page.locator("[data-card-stage] img, [data-card-stage] [data-skeleton], [data-card-stage] .grid").first().boundingBox();
  assert.ok(hero && hero.width >= 390 * 0.68, `${name}: the card is the big thing on the page (${Math.round(hero?.width ?? 0)}px)`);
  // The want-list star never wraps under the name.
  const star = await page.locator("[data-card-heading] a[aria-label], [data-card-heading] button[aria-label]").first().boundingBox().catch(() => null);
  if (star) assert.ok(star.width <= 48 && star.height <= 48, `${name}: the want star stays a 44px icon`);
}

const browser = await chromium.launch();
const results = [];

for (const scheme of ["dark", "light"]) {
  const { context, page, cases, errors } = await open(browser, { scheme });
  for (const [name, card] of Object.entries(cases)) {
    await show(page, `/u/${OTHER}/cards/${card.id}`);
    await shot(page, name, scheme);
    if (CHECK) await checkPage(page, `${name} (${scheme})`, SALES[name].length);
    results.push(`${name} ${scheme}`);
  }
  if (CHECK) {
    // ⓘ holds the source line.
    await show(page, `/u/${OTHER}/cards/${cases.vertical.id}`);
    await page.getByRole("button", { name: "About this price" }).tap();
    await page.waitForSelector("[data-price-info] [role=note]");
    const note = await page.locator("[data-price-info] [role=note]").innerText();
    assert.match(note, /Sold data via Trawl \(third-party, not affiliated with eBay\)/);
    assert.match(note, /Prices in USD/);
    await page.waitForTimeout(400);
    if (OUT) await page.screenshot({ path: join(OUT, `${TAG}-price-info-390-${scheme}.jpg`), type: "jpeg", quality: 82 });
    await page.keyboard.press("Escape");
    // The sideways card is whole: its box keeps the photo's own 7:5 shape.
    await show(page, `/u/${OTHER}/cards/${cases.horizontal.id}`);
    const box = await page.locator("[data-card-stage] img").boundingBox();
    assert.ok(Math.abs(box.width / box.height - 1.4) < 0.02, "the sideways card keeps its 7:5 shape");
    // Tap it for full screen.
    await page.locator("[data-card-stage] button").tap();
    await page.waitForSelector("[data-photo-viewer-dialog]");
    if (OUT) await page.screenshot({ path: join(OUT, `${TAG}-full-screen-390-${scheme}.jpg`), type: "jpeg", quality: 82 });
    await page.keyboard.press("Escape");
    // A tapped row lights its dot, and the tooltip names that sale.
    await show(page, `/u/${OTHER}/cards/${cases.three.id}`);
    await page.locator("[data-sale-row] button[aria-pressed]").first().tap();
    await page.waitForSelector("[data-chart-tip]");
    assert.match(await page.locator("[data-chart-tip]").innerText(), /\$36\.00/);
  }
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
}

// The owner's own card.
for (const scheme of ["dark", "light"]) {
  const { context, page, cases, errors } = await open(browser, { scheme, who: ME });
  await show(page, `/cards/${cases.vertical.id}`);
  await shot(page, "own", scheme);
  // The owner's controls under the card: who sees it, and the pile picker.
  if (OUT) {
    await page.evaluate(() => {
      const controls = document.querySelector('[data-slot="owner-controls"]');
      if (controls) window.scrollTo(0, window.scrollY + controls.getBoundingClientRect().top - 320);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${TAG}-own-controls-390-${scheme}.jpg`), type: "jpeg", quality: 82 });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  if (CHECK) {
    const piles = await page.locator('[data-slot="owner-controls"] [role="radio"]').allInnerTexts();
    assert.deepEqual(piles, ["Open to offers", "Personal collection"], "the pile picker's two labels");
  }
  if (CHECK) await checkPage(page, `own (${scheme})`, SALES.vertical.length);
  // The Collection's pile tabs carry the same name as the card page's picker.
  await page.goto(`${BASE}/collection`);
  await page.waitForSelector('[role="tab"]');
  await page.waitForTimeout(900);
  if (CHECK) {
    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    assert.ok(tabs.includes("Open to offers"), `Collection has an Open to offers tab (${tabs.join(", ")})`);
    assert.ok(!tabs.some((tab) => /flip/i.test(tab)), "no tab says Flipping");
  }
  if (OUT) await page.screenshot({ path: join(OUT, `${TAG}-collection-tabs-390-${scheme}.jpg`), type: "jpeg", quality: 82 });
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
  results.push(`own ${scheme}`);
}

// The sold-price states that are not a plain list: signed out, sold data down, too many checks.
for (const [name, options, words] of [
  ["signed-out", { signedOut: true }, null],
  ["sold-down", { soldStatus: 503 }, /Sales are taking a break/],
  ["rate-limited", { soldStatus: 429 }, /too quickly/],
]) {
  const { context, page, cases, errors } = await open(browser, { scheme: "dark", ...options });
  await show(page, `/u/${OTHER}/cards/${cases.vertical.id}`);
  await shot(page, name, "dark");
  if (CHECK) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, `${name}: 390 wide`);
    const text = await page.locator("[data-card-page]").innerText();
    if (words) assert.match(text, words, `${name}: says what happened`);
    assert.match(text, /\$195\.00/, `${name}: the stored value still shows`);
    assert.equal(await page.locator("[data-sale-dot]").count(), 0, `${name}: no chart without sales`);
  }
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
  results.push(name);
}

// A finger dragged across the chart: each sale's price and date, one at a time.
if (CHECK) {
  const { context, page, cases } = await open(browser, { scheme: "dark", video: true });
  await show(page, `/u/${OTHER}/cards/${cases.vertical.id}`);
  await page.locator("[data-sale-plot]").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const top = document.querySelector("[data-sale-plot]").getBoundingClientRect().top;
    window.scrollBy(0, top - 300);
  });
  await page.waitForTimeout(600);
  const plot = await page.locator("[data-sale-plot]").boundingBox();
  const y = plot.y + plot.height * 0.55;
  const seen = new Set();
  const watch = setInterval(() => {
    page.locator("[data-chart-tip]").innerText({ timeout: 200 }).then((text) => seen.add(text), () => {});
  }, 60);
  await touchDrag(page, { x: plot.x + 14, y }, { x: plot.x + plot.width - 60, y }, { steps: 70, hold: 35 });
  await page.waitForTimeout(300);
  await touchDrag(page, { x: plot.x + plot.width - 60, y }, { x: plot.x + 40, y }, { steps: 50, hold: 30 });
  clearInterval(watch);
  await page.waitForTimeout(500);
  assert.ok(seen.size >= 6, `the drag reads sale after sale (${seen.size} different tooltips)`);
  for (const text of seen) assert.match(text, /^\$[\d,.]+ · [A-Z][a-z]{2} \d+/, `tooltip is price and date: ${text}`);
  await context.close();
  if (OUT) {
    // Every page in the context is recorded: keep the card page's clip (the long one), drop the seed page's.
    const clips = readdirSync(OUT)
      .filter((file) => file.endsWith(".webm") && !file.startsWith("chart-scrub"))
      .sort((a, b) => statSync(join(OUT, b)).size - statSync(join(OUT, a)).size);
    if (clips[0]) renameSync(join(OUT, clips[0]), join(OUT, "chart-scrub-390-dark.webm"));
    for (const extra of clips.slice(1)) rmSync(join(OUT, extra));
  }
  results.push("chart scrub video");
}

await browser.close();
console.log(`${TAG}: ${results.length} runs ok\n${results.join("\n")}`);
